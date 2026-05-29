import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import BpmnViewer from 'bpmn-js/lib/NavigatedViewer'

import 'bpmn-js/dist/assets/diagram-js.css'
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn-embedded.css'

import { getProcessAudit } from '../api/audit'
import type { AuditResponse, AuditTaskRead } from '../types/api'

type ViewerInstance = InstanceType<typeof BpmnViewer>

const markerClasses = ['highlight-completed', 'highlight-completed-with-remark', 'highlight-active', 'highlight-gateway-waiting'] as const

function formatDateTime(value: string | null): string {
  if (!value) {
    return '—'
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ru-RU')
}

function formatDuration(value: number | null): string {
  if (value == null) {
    return '—'
  }

  const seconds = Math.floor(value / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const parts: string[] = []

  if (hours > 0) parts.push(`${hours}ч`)
  if (minutes % 60 > 0) parts.push(`${minutes % 60}м`)
  parts.push(`${seconds % 60}с`)
  return parts.join(' ')
}

function sortByLatest(tasks: AuditTaskRead[]): AuditTaskRead[] {
  return [...tasks].sort((left, right) => {
    const leftTime = left.startTime ? new Date(left.startTime).getTime() : 0
    const rightTime = right.startTime ? new Date(right.startTime).getTime() : 0
    return rightTime - leftTime
  })
}

export function BpmnAuditViewer() {
  const { processInstanceId } = useParams<{ processInstanceId: string }>()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const viewerRef = useRef<ViewerInstance | null>(null)
  const importedXmlRef = useRef<string>('')
  const highlightedIdsRef = useRef<string[]>([])
  const [audit, setAudit] = useState<AuditResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null)

  const selectedTasks = useMemo(() => {
    if (!selectedActivityId || !audit) {
      return []
    }

    return sortByLatest(audit.tasks.filter((task) => task.activityId === selectedActivityId))
  }, [audit, selectedActivityId])

  useEffect(() => {
    if (!processInstanceId) {
      setError('processInstanceId не найден в URL')
      setLoading(false)
      return
    }

    let cancelled = false

    const loadAudit = async () => {
      try {
        const response = await getProcessAudit(processInstanceId)
        if (cancelled) {
          return
        }
        setAudit(response)
        setError(null)
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить аудит')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadAudit()
    const intervalId = window.setInterval(loadAudit, 10_000)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [processInstanceId])

  useEffect(() => {
    console.log('audit data:', {
      hasBpmnXml: Boolean(audit?.bpmnXml),
      xmlLength: audit?.bpmnXml?.length,
      activeIds: audit?.activeActivityIds,
      completedIds: audit?.completedActivityIds,
    })
  }, [audit])

  useEffect(() => {
    if (!containerRef.current) {
      console.error('containerRef is null — viewer not created')
      return
    }

    const viewer = new BpmnViewer({ container: containerRef.current }) as ViewerInstance
    viewerRef.current = viewer
    console.log('Viewer created successfully')

    const eventBus = viewer.get('eventBus') as { on: (eventName: string, handler: (event: any) => void) => void }
    eventBus.on('element.click', (event: { element?: { id?: string } }) => {
      const elementId = event.element?.id ?? null
      if (elementId) {
        setSelectedActivityId(elementId)
      }
    })

    return () => {
      viewer.destroy()
      viewerRef.current = null
      importedXmlRef.current = ''
      highlightedIdsRef.current = []
    }
  }, [])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer || !audit?.bpmnXml) {
      return
    }

    let cancelled = false

    const render = async () => {
      try {
        if (audit.bpmnXml !== importedXmlRef.current) {
          await viewer.importXML(audit.bpmnXml)
          if (cancelled) {
            return
          }

          importedXmlRef.current = audit.bpmnXml
          const canvas = viewer.get('canvas') as { zoom: (mode: string) => void }
          canvas.zoom('fit-viewport')
        }

        if (cancelled) {
          return
        }

        const canvas = viewer.get('canvas') as {
          addMarker: (id: string, marker: string) => void
          removeMarker: (id: string, marker: string) => void
        }
        const overlays = viewer.get('overlays') as {
          clear: () => void
          add: (id: string, overlay: { position: { top?: number; right?: number; bottom?: number; left?: number }; html: string }) => void
        }
        const elementRegistry = viewer.get('elementRegistry') as {
          get: (id: string) => { businessObject?: { $type?: string } } | null
          getAll: () => Array<{ id?: string }>
        }

        const allElements = elementRegistry.getAll()
        const allIds = [...audit.activeActivityIds, ...audit.completedActivityIds]
        console.log('Registry elements after importXML:', allElements.length)
        console.log('Looking for:', allIds)
        console.log('Found:', allIds.map((id) => ({ id, found: Boolean(elementRegistry.get(id)) })))

        highlightedIdsRef.current.forEach((id) => {
          markerClasses.forEach((marker) => canvas.removeMarker(id, marker))
        })
        highlightedIdsRef.current = []
        overlays.clear()

        const activeIds = new Set(audit.activeActivityIds)
        const completedIds = new Set(audit.completedActivityIds)
        const activityIdsWithRemarks = new Set(
          audit.tasks
            .filter((task) => task.remarks && task.remarks.length > 0)
            .map((task) => task.activityId),
        )
        const elementsToHighlight = new Set<string>(allIds)

        elementsToHighlight.forEach((id) => {
          const element = elementRegistry.get(id)
          if (!element) {
            console.warn('Element not found in registry:', id)
            return
          }

          const isGateway = Boolean(element.businessObject?.$type?.includes('Gateway'))
          const hasRemark = activityIdsWithRemarks.has(id)

          let marker: string
          if (completedIds.has(id) && !activeIds.has(id)) {
            marker = hasRemark ? 'highlight-completed-with-remark' : 'highlight-completed'
          } else if (activeIds.has(id) && isGateway) {
            marker = 'highlight-gateway-waiting'
          } else if (activeIds.has(id)) {
            marker = 'highlight-active'
          } else {
            return
          }
          canvas.addMarker(id, marker)
          highlightedIdsRef.current.push(id)

          if (activeIds.has(id)) {
            overlays.add(id, {
              position: { bottom: -8, right: -8 },
              html: '<div class="pulse-dot"></div>',
            })
          }

          if (hasRemark && completedIds.has(id)) {
            overlays.add(id, {
              position: { top: -10, left: -10 },
              html: `
                <div style="
                  width: 20px; height: 20px;
                  background: #f59e0b;
                  border-radius: 50%;
                  border: 2px solid white;
                  display: flex; align-items: center; justify-content: center;
                  font-size: 12px; font-weight: 900; color: white;
                  box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                ">!</div>
              `,
            })
          }

          const count = audit.activityCounts[id]
          if (count > 1) {
            overlays.add(id, {
              position: { top: -8, right: -8 },
              html: `<div class="audit-count-badge">${count}</div>`,
            })
          }
        })
      } catch (e) {
        if (!cancelled) {
          console.error('BpmnAuditViewer render error:', e)
        }
      }
    }

    void render()

    return () => {
      cancelled = true
    }
  }, [audit])

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,0.9fr)]">
      <div className="space-y-4">
        {audit ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-xl shadow-slate-900/5">
            <div className="flex flex-wrap gap-3 text-sm">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 font-semibold text-emerald-700">Завершено: {audit.completedActivityIds.length}</div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 font-semibold text-amber-700">Активно: {audit.activeActivityIds.length}</div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 font-semibold text-slate-700">Элементов с циклами: {Object.values(audit.activityCounts).filter((count) => count > 1).length}</div>
            </div>
          </div>
        ) : null}

        <div className="rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-900/5">
          <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold uppercase tracking-[0.28em] text-slate-400">BPMN audit</div>
          <div className="relative h-[760px] overflow-hidden">
            <div ref={containerRef} className="h-full w-full" />

            {loading ? (
              <div className="absolute inset-0 flex items-center justify-center rounded-b-3xl bg-white/80 backdrop-blur-sm">
                <div className="text-sm text-slate-500">Загрузка аудита...</div>
              </div>
            ) : null}

            {error && !loading ? (
              <div className="absolute inset-0 flex items-center justify-center rounded-b-3xl bg-white/80">
                <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                  {error}
                </div>
              </div>
            ) : null}

            {!loading && !error && !audit ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-sm text-slate-500">Данные аудита отсутствуют.</div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <aside className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-xl shadow-slate-900/5">
        <div>
          <div className="text-xs uppercase tracking-[0.35em] text-slate-400">Подробности</div>
          <h2 className="mt-2 text-2xl font-semibold text-slate-950">{selectedActivityId ?? 'Выберите элемент'}</h2>
        </div>

        {!audit || selectedTasks.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
            Кликните по задаче, gateway или событию, чтобы увидеть историю выполнения и длительность.
          </div>
        ) : (
          <div className="space-y-3">
            {selectedTasks.map((task) => (
              <div key={`${task.activityId}-${task.startTime ?? 'active'}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{task.name ?? task.activityId}</div>
                    <div className="mt-1 text-xs uppercase tracking-[0.25em] text-slate-400">{task.status}</div>
                  </div>
                  <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">{formatDuration(task.durationInMillis)}</div>
                </div>

                <div className="mt-4 grid gap-3 text-sm text-slate-700">
                  <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Исполнитель</div>
                    <div className="mt-1 font-medium text-slate-900">{task.assignee ?? '—'}</div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Старт</div>
                      <div className="mt-1 text-slate-900">{formatDateTime(task.startTime)}</div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Финиш</div>
                      <div className="mt-1 text-slate-900">{formatDateTime(task.endTime)}</div>
                    </div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Повторы элемента</div>
                    <div className="mt-1 text-slate-900">{audit.activityCounts[task.activityId] ?? 1}</div>
                  </div>
                </div>

                <div className="mt-4 border-t border-slate-200 pt-4">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Замечания</div>
                    {task.remarks && task.remarks.length > 0 ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">{task.remarks.length}</span>
                    ) : null}
                  </div>

                  {(!task.remarks || task.remarks.length === 0) ? (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-white px-3 py-3 text-xs text-slate-400">Замечаний нет</div>
                  ) : (
                    <div className="space-y-2">
                      {task.remarks.map((remark) => (
                        <div key={remark.id} className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                          <div className="flex items-start gap-2">
                            <span className="mt-0.5 text-amber-500">⚠</span>
                            <p className="text-sm leading-relaxed text-slate-800">{remark.remark}</p>
                          </div>
                          <div className="mt-2 flex items-center justify-between">
                            <span className="text-xs font-medium text-slate-600">{remark.author_name ?? remark.author_id}</span>
                            <span className="text-xs text-slate-400">{new Date(remark.created_at).toLocaleString('ru-RU')}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </aside>
    </div>
  )
}