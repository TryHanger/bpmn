import { useEffect, useMemo, useState } from 'react'

import { analyzeTemplateMigration, executeTemplateMigration } from '../api/templates'
import type {
  ActiveProcessInstance,
  MigrationAnalysisResponse,
  MigrationExecuteResponse,
  MigrationItemRequest,
} from '../types/api'
import { showToast } from '../lib/toast'
import { MigrationDiagramViewer } from './MigrationDiagramViewer'

type MigrationStep = 'select' | 'analysis' | 'confirm' | 'result'

interface MigrationModalProps {
  open: boolean
  templateId: string | null
  templateName: string | null
  targetVersionId: string | null
  activeInstances: ActiveProcessInstance[]
  onDeploy: () => Promise<string>
  onClose: () => void
  onCompleted: () => void
}

interface InstancePlan {
  cancelActivityIds: string[]
  startActivityIds: string[]
}

function formatDateTime(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ru-RU')
}

function buildMarkerMap(entries: Array<[string, string[]]>): Record<string, string[]> {
  return entries.reduce<Record<string, string[]>>((accumulator, [id, classes]) => {
    if (classes.length > 0) {
      accumulator[id] = classes
    }
    return accumulator
  }, {})
}

function getInstanceTitle(instance: ActiveProcessInstance): string {
  return instance.name || instance.business_key || instance.id
}

export function MigrationModal({ open, templateId, templateName, targetVersionId, activeInstances, onDeploy, onClose, onCompleted }: MigrationModalProps) {
  const [step, setStep] = useState<MigrationStep>('select')
  const [selectedInstanceIds, setSelectedInstanceIds] = useState<Set<string>>(new Set())
  const [analysis, setAnalysis] = useState<MigrationAnalysisResponse | null>(null)
  const [instancePlans, setInstancePlans] = useState<Record<string, InstancePlan>>({})
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null)
  const [result, setResult] = useState<MigrationExecuteResponse | null>(null)
  const [loadingAnalysis, setLoadingAnalysis] = useState(false)
  const [loadingExecute, setLoadingExecute] = useState(false)

  useEffect(() => {
    if (!open) {
      return
    }

    const initialIds = new Set(activeInstances.map((instance) => instance.id))
    setStep('select')
    setSelectedInstanceIds(initialIds)
    setAnalysis(null)
    setInstancePlans({})
    setSelectedInstanceId(activeInstances[0]?.id ?? null)
    setResult(null)
    setLoadingAnalysis(false)
    setLoadingExecute(false)
  }, [activeInstances, open])

  const selectedInstances = useMemo(
    () => activeInstances.filter((instance) => selectedInstanceIds.has(instance.id)),
    [activeInstances, selectedInstanceIds],
  )

  useEffect(() => {
    if (!selectedInstanceId && selectedInstances.length > 0) {
      setSelectedInstanceId(selectedInstances[0].id)
    }
  }, [selectedInstanceId, selectedInstances])

  useEffect(() => {
    if (!analysis || step !== 'analysis') {
      return
    }

    const currentSelection = analysis.instances.find((instance) => instance.id === selectedInstanceId) ?? analysis.instances[0] ?? null
    if (currentSelection && !selectedInstanceId) {
      setSelectedInstanceId(currentSelection.id)
    }
  }, [analysis, selectedInstanceId, step])

  const selectedAnalysisInstance = analysis?.instances.find((instance) => instance.id === selectedInstanceId) ?? analysis?.instances[0] ?? null

  // ID → display name lookups built from schema task lists
  const oldTaskNameMap = useMemo<Record<string, string>>(() => {
    if (!analysis) return {}
    return Object.fromEntries(analysis.old_schema_tasks.map((t) => [t.id, t.name]))
  }, [analysis])

  const newTaskNameMap = useMemo<Record<string, string>>(() => {
    if (!analysis) return {}
    return Object.fromEntries(analysis.new_schema_tasks.map((t) => [t.id, t.name]))
  }, [analysis])

  const oldName = (id: string) => oldTaskNameMap[id] ?? id
  const newName = (id: string) => newTaskNameMap[id] ?? id

  const sourceMarkers = useMemo(() => {
    if (!analysis || !selectedAnalysisInstance) {
      return {}
    }

    return buildMarkerMap([
      ...analysis.removed_activity_ids.map((id) => [id, ['highlight-removed']] as [string, string[]]),
      ...selectedAnalysisInstance.current_activity_ids.map((id) => [id, ['highlight-token-source']] as [string, string[]]),
    ])
  }, [analysis, selectedAnalysisInstance])

  const targetMarkers = useMemo(() => {
    if (!analysis || !selectedAnalysisInstance) {
      return {}
    }

    const selectedTargets = instancePlans[selectedAnalysisInstance.id]?.startActivityIds ?? []
    return buildMarkerMap([
      ...analysis.added_activity_ids.map((id) => [id, ['highlight-added']] as [string, string[]]),
      ...selectedTargets.map((id) => [id, ['highlight-selected-target']] as [string, string[]]),
    ])
  }, [analysis, instancePlans, selectedAnalysisInstance])

  const analyzeMutation = async () => {
    if (!templateId || !targetVersionId) {
      return
    }

    if (selectedInstanceIds.size === 0) {
      showToast('Выберите хотя бы один активный процесс', 'error')
      return
    }

    setLoadingAnalysis(true)
    try {
      const response = await analyzeTemplateMigration(templateId, {
        target_version_id: targetVersionId,
        instance_ids: Array.from(selectedInstanceIds),
      })
      setAnalysis(response)

      const nextPlans = response.instances.reduce<Record<string, InstancePlan>>((accumulator, instance) => {
        accumulator[instance.id] = {
          cancelActivityIds: instance.current_activity_ids,
          startActivityIds: [],
        }
        return accumulator
      }, {})
      setInstancePlans(nextPlans)
      setSelectedInstanceId(response.instances.find((instance) => instance.needs_state_change)?.id ?? response.instances[0]?.id ?? null)
      setStep('analysis')
    } catch (error) {
      console.log('migration analysis error:', (error as { response?: { data?: unknown } })?.response?.data)
      showToast(error instanceof Error ? error.message : 'Не удалось выполнить анализ миграции', 'error')
    } finally {
      setLoadingAnalysis(false)
    }
  }

  const executeMutation = async () => {
    if (!templateId || !targetVersionId || !analysis) {
      return
    }

    try {
      await onDeploy()
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Ошибка деплоя', 'error')
      return
    }

    const migrations: MigrationItemRequest[] = analysis.instances.map((instance) => {
      const plan = instancePlans[instance.id] ?? { cancelActivityIds: [], startActivityIds: [] }
      return {
        instance_id: instance.id,
        cancel_activity_ids: instance.needs_state_change ? plan.cancelActivityIds : [],
        start_activity_ids: instance.needs_state_change ? plan.startActivityIds : [],
      }
    })

    const invalidInstance = analysis.instances.find((instance) => instance.needs_state_change && (instancePlans[instance.id]?.startActivityIds.length ?? 0) === 0)
    if (invalidInstance) {
      showToast(`Выберите целевую задачу для процесса ${getInstanceTitle(activeInstances.find((item) => item.id === invalidInstance.id) ?? activeInstances[0])}`, 'error')
      return
    }

    setLoadingExecute(true)
    try {
      const response = await executeTemplateMigration(templateId, {
        target_version_id: targetVersionId,
        migrations,
      })
      setResult(response)
      setStep('result')
      onCompleted()
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не удалось выполнить миграцию', 'error')
    } finally {
      setLoadingExecute(false)
    }
  }

  const toggleSelectedInstance = (instanceId: string) => {
    setSelectedInstanceIds((current) => {
      const next = new Set(current)
      if (next.has(instanceId)) {
        next.delete(instanceId)
      } else {
        next.add(instanceId)
      }
      return next
    })
  }

  const toggleAllInstances = () => {
    if (selectedInstanceIds.size === activeInstances.length) {
      setSelectedInstanceIds(new Set())
      return
    }

    setSelectedInstanceIds(new Set(activeInstances.map((instance) => instance.id)))
  }

  const toggleCancelActivity = (activityId: string) => {
    if (!selectedAnalysisInstance) {
      return
    }

    setInstancePlans((current) => {
      const plan = current[selectedAnalysisInstance.id] ?? { cancelActivityIds: [], startActivityIds: [] }
      const nextCancelActivityIds = plan.cancelActivityIds.includes(activityId)
        ? plan.cancelActivityIds.filter((id) => id !== activityId)
        : [...plan.cancelActivityIds, activityId]

      return {
        ...current,
        [selectedAnalysisInstance.id]: {
          ...plan,
          cancelActivityIds: nextCancelActivityIds,
        },
      }
    })
  }

  const toggleTargetActivity = (activityId: string) => {
    if (!selectedAnalysisInstance) {
      return
    }

    setInstancePlans((current) => {
      const plan = current[selectedAnalysisInstance.id] ?? { cancelActivityIds: [], startActivityIds: [] }
      const nextStartActivityIds = plan.startActivityIds.includes(activityId)
        ? plan.startActivityIds.filter((id) => id !== activityId)
        : [...plan.startActivityIds, activityId]

      return {
        ...current,
        [selectedAnalysisInstance.id]: {
          ...plan,
          startActivityIds: nextStartActivityIds,
        },
      }
    })
  }

  if (!open) {
    return null
  }

  const hasRemapPending = Boolean(analysis?.instances.some((instance) => instance.needs_state_change && (instancePlans[instance.id]?.startActivityIds.length ?? 0) === 0))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 py-6 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl shadow-slate-950/20">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Deploy and migrate</div>
            <h2 className="mt-2 text-2xl font-semibold text-slate-950">{templateName ?? 'Шаблон'}: миграция активных процессов</h2>
            <p className="mt-1 text-sm text-slate-500">
              Сначала выберите активные экземпляры, затем проверьте разницу BPMN и сопоставьте новые точки входа токена.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-200">
            Закрыть
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {step === 'select' ? (
            <div className="space-y-5">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                Выберите процессы для миграции. После deploy будет выполнен анализ выбранной новой версии и старых активных экземпляров.
              </div>

              <div className="flex items-center justify-between">
                <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
                  <input type="checkbox" className="h-4 w-4 rounded accent-slate-800" checked={selectedInstanceIds.size === activeInstances.length} onChange={toggleAllInstances} />
                  Выбрать все ({activeInstances.length})
                </label>
                <div className="text-xs text-slate-400">Выбрано: {selectedInstanceIds.size}</div>
              </div>

              <div className="max-h-[28rem] space-y-3 overflow-y-auto pr-1">
                {activeInstances.map((instance) => (
                  <label key={instance.id} className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 p-4 transition hover:bg-slate-50">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 shrink-0 rounded accent-slate-800"
                      checked={selectedInstanceIds.has(instance.id)}
                      onChange={() => toggleSelectedInstance(instance.id)}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-slate-900">{getInstanceTitle(instance)}</div>
                      <div className="mt-0.5 font-mono text-xs text-slate-400">{instance.flowable_process_instance_id}</div>
                      <div className="mt-0.5 text-xs text-slate-400">Начат: {formatDateTime(instance.start_time)}</div>
                      {instance.current_activities.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {instance.current_activities.map((activityId) => (
                            <span key={activityId} className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-500">
                              {activityId}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </label>
                ))}
              </div>

              <div className="flex justify-end gap-3">
                <button type="button" onClick={onClose} className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={() => void analyzeMutation()}
                  disabled={loadingAnalysis || selectedInstanceIds.size === 0}
                  className="rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loadingAnalysis ? 'Анализ...' : 'Перейти к анализу'}
                </button>
              </div>
            </div>
          ) : step === 'analysis' && analysis ? (
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl bg-slate-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Выбрано</div>
                  <div className="mt-2 text-2xl font-bold text-slate-950">{analysis.instances.length}</div>
                </div>
                <div className="rounded-2xl bg-emerald-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-500">Новые задачи</div>
                  <div className="mt-2 text-2xl font-bold text-emerald-900">{analysis.added_activity_ids.length}</div>
                </div>
                <div className="rounded-2xl bg-rose-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-500">Удалённые задачи</div>
                  <div className="mt-2 text-2xl font-bold text-rose-900">{analysis.removed_activity_ids.length}</div>
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-[16rem_minmax(0,1fr)]">
                <aside className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Экземпляры</div>
                  <div className="mt-3 space-y-2">
                    {analysis.instances.map((instance) => {
                      const isSelected = instance.id === selectedInstanceId
                      return (
                        <button
                          key={instance.id}
                          type="button"
                          onClick={() => setSelectedInstanceId(instance.id)}
                          className={[
                            'w-full rounded-2xl border px-3 py-3 text-left transition',
                            isSelected ? 'border-slate-900 bg-white shadow-sm' : 'border-slate-200 bg-white/70 hover:bg-white',
                          ].join(' ')}
                        >
                          <div className="text-sm font-medium text-slate-900">{getInstanceTitle(activeInstances.find((item) => item.id === instance.id) ?? activeInstances[0])}</div>
                          <div className="mt-1 text-xs text-slate-500">{instance.needs_state_change ? 'Требуется перенос токена' : 'Автомиграция без смены состояния'}</div>
                        </button>
                      )
                    })}
                  </div>
                </aside>

                <div className="space-y-4">
                  <div className="grid gap-4 xl:grid-cols-2">
                    <MigrationDiagramViewer xml={analysis.old_bpmn_xml} markers={sourceMarkers} emptyLabel="Старая версия BPMN не загружена" />
                    <MigrationDiagramViewer
                      xml={analysis.new_bpmn_xml}
                      markers={targetMarkers}
                      interactive={Boolean(selectedAnalysisInstance?.needs_state_change)}
                      onElementClick={(elementId) => {
                        toggleTargetActivity(elementId)
                      }}
                      emptyLabel="Новая версия BPMN не загружена"
                    />
                  </div>

                  {selectedAnalysisInstance ? (
                    <div className="grid gap-4 xl:grid-cols-2">
                      <div className="rounded-2xl border border-slate-200 bg-white p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Точки старта</div>
                            <div className="mt-1 text-sm font-medium text-slate-900">Текущие активные задачи</div>
                          </div>
                          <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">{selectedAnalysisInstance.current_activity_ids.length}</span>
                        </div>
                        <div className="mt-3 space-y-2">
                          {selectedAnalysisInstance.current_activity_ids.map((activityId) => {
                            const checked = instancePlans[selectedAnalysisInstance.id]?.cancelActivityIds.includes(activityId) ?? false
                            return (
                              <label key={activityId} className="flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 px-3 py-2 transition hover:bg-slate-50">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 rounded accent-slate-800"
                                  checked={checked}
                                  onChange={() => toggleCancelActivity(activityId)}
                                  disabled={!selectedAnalysisInstance.needs_state_change}
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-sm font-medium text-slate-800">{oldName(activityId)}</div>
                                  {oldTaskNameMap[activityId] ? <div className="truncate font-mono text-[11px] text-slate-400">{activityId}</div> : null}
                                </div>
                              </label>
                            )
                          })}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-white p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Цель переноса</div>
                            <div className="mt-1 text-sm font-medium text-slate-900">Кликните по новой задаче на правой диаграмме</div>
                          </div>
                          <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700">
                            {instancePlans[selectedAnalysisInstance.id]?.startActivityIds.length ?? 0}
                          </span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {(instancePlans[selectedAnalysisInstance.id]?.startActivityIds ?? []).map((activityId) => (
                            <button
                              key={activityId}
                              type="button"
                              onClick={() => toggleTargetActivity(activityId)}
                              className="flex flex-col items-start rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-left transition hover:bg-emerald-100"
                            >
                              <span className="text-sm font-medium text-emerald-800">{newName(activityId)}</span>
                              {newTaskNameMap[activityId] ? <span className="font-mono text-[11px] text-emerald-500">{activityId}</span> : null}
                            </button>
                          ))}
                          {(instancePlans[selectedAnalysisInstance.id]?.startActivityIds.length ?? 0) === 0 ? (
                            <span className="text-sm text-slate-400">Ничего не выбрано</span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <div className="flex justify-between gap-3">
                    <button type="button" onClick={() => setStep('select')} className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                      Назад
                    </button>
                    <button
                      type="button"
                      onClick={() => setStep('confirm')}
                      disabled={hasRemapPending}
                      className="rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Продолжить
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : step === 'confirm' && analysis ? (
            <div className="space-y-5">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                Проверьте итоговый план. Если у экземпляра требуется перенос токена, для него должен быть выбран хотя бы один целевой элемент.
              </div>

              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-[0.18em] text-slate-400">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Процесс</th>
                      <th className="px-4 py-3 font-semibold">Снятие</th>
                      <th className="px-4 py-3 font-semibold">Старт</th>
                      <th className="px-4 py-3 font-semibold">Статус</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {analysis.instances.map((instance) => {
                      const plan = instancePlans[instance.id] ?? { cancelActivityIds: [], startActivityIds: [] }
                      const ready = !instance.needs_state_change || plan.startActivityIds.length > 0
                      return (
                        <tr key={instance.id}>
                          <td className="px-4 py-3">
                            <div className="font-medium text-slate-900">{getInstanceTitle(activeInstances.find((item) => item.id === instance.id) ?? activeInstances[0])}</div>
                            <div className="font-mono text-xs text-slate-400">{instance.flowable_process_instance_id}</div>
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {plan.cancelActivityIds.length > 0
                              ? plan.cancelActivityIds.map((id) => (
                                  <div key={id}>
                                    <span className="font-medium text-slate-800">{oldName(id)}</span>
                                    {oldTaskNameMap[id] ? <span className="ml-1 font-mono text-[11px] text-slate-400">({id})</span> : null}
                                  </div>
                                ))
                              : '—'}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {plan.startActivityIds.length > 0
                              ? plan.startActivityIds.map((id) => (
                                  <div key={id}>
                                    <span className="font-medium text-slate-800">{newName(id)}</span>
                                    {newTaskNameMap[id] ? <span className="ml-1 font-mono text-[11px] text-slate-400">({id})</span> : null}
                                  </div>
                                ))
                              : '—'}
                          </td>
                          <td className="px-4 py-3">
                            <span className={['rounded-full px-2 py-1 text-xs font-semibold', ready ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'].join(' ')}>
                              {ready ? 'Готово' : 'Требует выбора'}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-between gap-3">
                <button type="button" onClick={() => setStep('analysis')} className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                  Назад
                </button>
                <button
                  type="button"
                  onClick={() => void executeMutation()}
                  disabled={loadingExecute || hasRemapPending}
                  className="rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loadingExecute ? 'Выполняется...' : 'Выполнить миграцию'}
                </button>
              </div>
            </div>
          ) : step === 'result' && result ? (
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-4">
                {[
                  { label: 'Мигрировано', value: result.migrated, color: 'bg-emerald-50 text-emerald-800' },
                  { label: 'С переносом', value: result.state_changed, color: 'bg-blue-50 text-blue-800' },
                  { label: 'Ошибки', value: result.errors, color: 'bg-rose-50 text-rose-800' },
                  { label: 'Всего', value: result.results.length, color: 'bg-slate-50 text-slate-800' },
                ].map((stat) => (
                  <div key={stat.label} className={['rounded-2xl p-4 text-center', stat.color].join(' ')}>
                    <div className="text-2xl font-bold">{stat.value}</div>
                    <div className="mt-1 text-xs font-semibold uppercase tracking-[0.18em]">{stat.label}</div>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                {result.results.map((item) => (
                  <div key={item.instance_id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-mono text-xs text-slate-500">{item.instance_id}</div>
                      <span className={['rounded-full px-2 py-1 text-xs font-semibold', item.status === 'error' ? 'bg-rose-100 text-rose-700' : item.status === 'migrated_with_state_change' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'].join(' ')}>
                        {item.status}
                      </span>
                    </div>
                    {item.error ? <div className="mt-2 text-sm text-rose-600">{item.error}</div> : null}
                  </div>
                ))}
              </div>

              <div className="flex justify-end">
                <button type="button" onClick={onClose} className="rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700">
                  Закрыть
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}