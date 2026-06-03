import { useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'

import { getRoles } from '../api/roles'
import { uploadTemplate } from '../api/templates'
import { generateBpmnXml, validateTemplate } from '../lib/bpmnStageGenerator'
import type { ProcessTemplate, ValidationError } from '../lib/bpmnStageGenerator'
import type { RoleResponse, TemplateRead } from '../types/api'
import { showToast } from '../lib/toast'
import { useAuthStore } from '../store/authStore'

// ─── Local state types ────────────────────────────────────────────────────────

interface LocalUser {
  id: string    // flowable_group
  label: string // role.name
}

interface LocalSubblock {
  _key: string
  name: string
  users: LocalUser[]
}

interface LocalStage {
  _key: string
  name: string
  deadline_hours: number
  mode: 'users' | 'subblocks'
  users: LocalUser[]
  subblocks: LocalSubblock[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

let _localId = 0
const nextKey = () => `k_${++_localId}`

function emptyStage(): LocalStage {
  return { _key: nextKey(), name: '', deadline_hours: 24, mode: 'users', users: [], subblocks: [] }
}

function emptySubblock(): LocalSubblock {
  return { _key: nextKey(), name: '', users: [] }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function RoleDropdown({
  available,
  selected,
  onAdd,
}: {
  available: RoleResponse[]
  selected: LocalUser[]
  onAdd: (u: LocalUser) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const unselected = available.filter(r => !selected.some(u => u.id === r.flowable_group))

  if (unselected.length === 0) return null

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1 rounded-xl border border-dashed border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-500 transition hover:border-slate-400 hover:text-slate-700"
      >
        + Добавить
      </button>

      {open ? (
        <div className="absolute left-0 top-full z-20 mt-1 max-h-52 w-52 overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10">
          {unselected.map(r => (
            <button
              key={r.id}
              type="button"
              className="block w-full px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 first:rounded-t-2xl last:rounded-b-2xl"
              onClick={() => {
                onAdd({ id: r.flowable_group, label: r.name })
                setOpen(false)
              }}
            >
              <div className="font-medium">{r.name}</div>
              <div className="font-mono text-[10px] text-slate-400">{r.flowable_group}</div>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function UserChips({
  users,
  onRemove,
  roles,
  onAdd,
  disabled,
}: {
  users: LocalUser[]
  onRemove: (id: string) => void
  roles: RoleResponse[]
  onAdd: (u: LocalUser) => void
  disabled?: boolean
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {users.map(u => (
        <div key={u.id} className="flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 pl-3 pr-2 py-1">
          <span className="text-xs font-medium text-blue-800">{u.label}</span>
          {!disabled ? (
            <button
              type="button"
              onClick={() => onRemove(u.id)}
              className="flex h-4 w-4 items-center justify-center rounded-full text-blue-400 transition hover:bg-blue-200 hover:text-blue-700"
            >
              ✕
            </button>
          ) : null}
        </div>
      ))}
      {!disabled ? <RoleDropdown available={roles} selected={users} onAdd={onAdd} /> : null}
      {users.length === 0 && !disabled ? (
        <span className="text-xs text-slate-400">Нет исполнителей</span>
      ) : null}
    </div>
  )
}

// ─── Main modal ───────────────────────────────────────────────────────────────

interface Props {
  open: boolean
  onClose: () => void
  onCreated: (template: TemplateRead) => void
}

export function StageBuilderModal({ open, onClose, onCreated }: Props) {
  const authUser = useAuthStore(s => s.user)
  const companyId = authUser?.company_id ?? ''

  const rolesQuery = useQuery({
    queryKey: ['roles', companyId],
    queryFn: () => getRoles(companyId),
    enabled: open && Boolean(companyId),
  })
  const roles = rolesQuery.data ?? []

  // Form state
  const [processId, setProcessId]       = useState('')
  const [processName, setProcessName]   = useState('')
  const [templateName, setTemplateName] = useState('')
  const [templateNameTouched, setTemplateNameTouched] = useState(false)
  const [stages, setStages]             = useState<LocalStage[]>([emptyStage()])
  const [errors, setErrors]             = useState<ValidationError[]>([])
  const [submitting, setSubmitting]     = useState(false)

  // Auto-sync templateName with processName
  useEffect(() => {
    if (!templateNameTouched) setTemplateName(processName)
  }, [processName, templateNameTouched])

  // Reset on open
  useEffect(() => {
    if (!open) return
    setProcessId('')
    setProcessName('')
    setTemplateName('')
    setTemplateNameTouched(false)
    setStages([emptyStage()])
    setErrors([])
    setSubmitting(false)
  }, [open])

  if (!open) return null

  // ── Stage operations ────────────────────────────────────────────────────────

  const addStage = () => setStages(prev => [...prev, emptyStage()])

  const removeStage = (key: string) =>
    setStages(prev => prev.filter(s => s._key !== key))

  const updateStage = (key: string, patch: Partial<LocalStage>) =>
    setStages(prev => prev.map(s => s._key === key ? { ...s, ...patch } : s))

  const moveStage = (key: string, dir: -1 | 1) => {
    setStages(prev => {
      const idx = prev.findIndex(s => s._key === key)
      if (idx === -1) return prev
      const next = [...prev]
      const swap = idx + dir
      if (swap < 0 || swap >= next.length) return prev
      ;[next[idx], next[swap]] = [next[swap], next[idx]]
      return next
    })
  }

  const setStageMode = (key: string, mode: 'users' | 'subblocks') => {
    setStages(prev => prev.map(s =>
      s._key === key
        ? { ...s, mode, users: mode === 'users' ? s.users : [], subblocks: mode === 'subblocks' ? (s.subblocks.length > 0 ? s.subblocks : [emptySubblock()]) : [] }
        : s
    ))
  }

  // Stage user operations
  const addUserToStage = (stageKey: string, user: LocalUser) =>
    setStages(prev => prev.map(s =>
      s._key === stageKey && !s.users.some(u => u.id === user.id)
        ? { ...s, users: [...s.users, user] }
        : s
    ))

  const removeUserFromStage = (stageKey: string, userId: string) =>
    setStages(prev => prev.map(s =>
      s._key === stageKey ? { ...s, users: s.users.filter(u => u.id !== userId) } : s
    ))

  // Subblock operations
  const addSubblock = (stageKey: string) =>
    setStages(prev => prev.map(s =>
      s._key === stageKey ? { ...s, subblocks: [...s.subblocks, emptySubblock()] } : s
    ))

  const removeSubblock = (stageKey: string, sbKey: string) =>
    setStages(prev => prev.map(s =>
      s._key === stageKey ? { ...s, subblocks: s.subblocks.filter(sb => sb._key !== sbKey) } : s
    ))

  const updateSubblock = (stageKey: string, sbKey: string, patch: Partial<LocalSubblock>) =>
    setStages(prev => prev.map(s =>
      s._key === stageKey
        ? { ...s, subblocks: s.subblocks.map(sb => sb._key === sbKey ? { ...sb, ...patch } : sb) }
        : s
    ))

  const addUserToSubblock = (stageKey: string, sbKey: string, user: LocalUser) =>
    setStages(prev => prev.map(s =>
      s._key === stageKey
        ? {
            ...s,
            subblocks: s.subblocks.map(sb =>
              sb._key === sbKey && !sb.users.some(u => u.id === user.id)
                ? { ...sb, users: [...sb.users, user] }
                : sb
            ),
          }
        : s
    ))

  const removeUserFromSubblock = (stageKey: string, sbKey: string, userId: string) =>
    setStages(prev => prev.map(s =>
      s._key === stageKey
        ? { ...s, subblocks: s.subblocks.map(sb =>
              sb._key === sbKey ? { ...sb, users: sb.users.filter(u => u.id !== userId) } : sb
            ) }
        : s
    ))

  // ── Submit ──────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    const tpl: ProcessTemplate = {
      processId: processId.trim(),
      processName: processName.trim(),
      templateName: templateName.trim() || processName.trim(),
      stages: stages.map(s => ({
        id: s._key,
        name: s.name,
        deadline_hours: s.deadline_hours,
        mode: s.mode,
        users: s.mode === 'users' ? s.users : [],
        subblocks: s.mode === 'subblocks'
          ? s.subblocks.map(sb => ({ id: sb._key, name: sb.name, users: sb.users }))
          : [],
      })),
    }

    const errs = validateTemplate(tpl)
    if (errs.length > 0) {
      setErrors(errs)
      return
    }
    setErrors([])

    setSubmitting(true)
    try {
      const xml = generateBpmnXml(tpl)
      const file = new File([xml], `${tpl.processId}.bpmn20.xml`, { type: 'application/xml' })
      const template = await uploadTemplate(file, tpl.templateName)
      showToast('Шаблон создан', 'success')
      onCreated(template)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Ошибка создания шаблона', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const processIdError = errors.find(e => e.field === 'processId')?.message

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 px-4 py-8 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="relative my-auto w-full max-w-3xl rounded-3xl bg-white shadow-2xl shadow-slate-950/20"
        onClick={e => e.stopPropagation()}
        role="presentation"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Конструктор</div>
            <h2 className="mt-1 text-2xl font-semibold text-slate-950">Создать шаблон из блоков</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-200"
          >
            Закрыть
          </button>
        </div>

        {/* Scrollable body */}
        <div className="max-h-[72vh] overflow-y-auto px-6 py-5 space-y-6">

          {/* Process meta */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-800">Process ID *</label>
              <input
                value={processId}
                onChange={e => setProcessId(e.target.value)}
                placeholder="contractApproval"
                className={[
                  'w-full rounded-2xl border px-4 py-3 text-sm outline-none transition focus:ring-4',
                  processIdError
                    ? 'border-red-300 bg-red-50 focus:border-red-500 focus:ring-red-100'
                    : 'border-slate-200 bg-white focus:border-blue-500 focus:ring-blue-100',
                ].join(' ')}
              />
              <div className="mt-1 text-[11px] text-slate-400">Только латиница, цифры, _ и -. Первый символ — буква.</div>
              {processIdError ? <div className="mt-1 text-xs font-medium text-red-600">{processIdError}</div> : null}
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-800">Название процесса *</label>
              <input
                value={processName}
                onChange={e => setProcessName(e.target.value)}
                placeholder="Согласование договора"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-sm font-semibold text-slate-800">Название шаблона (в списке)</label>
              <input
                value={templateName}
                onChange={e => { setTemplateName(e.target.value); setTemplateNameTouched(true) }}
                placeholder="Согласование договора"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              />
            </div>
          </div>

          {/* Stages */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-800">Блоки процесса</div>
              <div className="text-xs text-slate-400">{stages.length} блок{stages.length === 1 ? '' : stages.length < 5 ? 'а' : 'ов'}</div>
            </div>

            {errors.find(e => e.field === 'stages') ? (
              <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {errors.find(e => e.field === 'stages')?.message}
              </div>
            ) : null}

            <div className="space-y-3">
              {stages.map((stage, idx) => {
                const stageErrors = errors.filter(e => e.field.startsWith(`stages[${idx}]`))

                return (
                  <div
                    key={stage._key}
                    className={[
                      'rounded-3xl border p-4 transition',
                      stageErrors.length > 0 ? 'border-red-200 bg-red-50/30' : 'border-slate-200 bg-slate-50',
                    ].join(' ')}
                  >
                    {/* Stage header */}
                    <div className="flex items-center gap-3">
                      <div className="flex shrink-0 flex-col gap-1">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => moveStage(stage._key, -1)}
                          className="rounded-lg p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 disabled:opacity-30"
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          disabled={idx === stages.length - 1}
                          onClick={() => moveStage(stage._key, 1)}
                          className="rounded-lg p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 disabled:opacity-30"
                        >
                          ▼
                        </button>
                      </div>

                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xs font-bold text-white">
                        {idx + 1}
                      </div>

                      <input
                        value={stage.name}
                        onChange={e => updateStage(stage._key, { name: e.target.value })}
                        placeholder="Название блока"
                        className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      />

                      <div className="flex shrink-0 items-center gap-2">
                        <input
                          type="number"
                          min={1}
                          value={stage.deadline_hours}
                          onChange={e => updateStage(stage._key, { deadline_hours: Number(e.target.value) || 24 })}
                          className="w-16 rounded-xl border border-slate-200 bg-white px-2 py-2 text-center text-sm outline-none focus:border-blue-500"
                          title="Срок (часов)"
                        />
                        <span className="text-xs text-slate-400">ч</span>

                        {stages.length > 1 ? (
                          <button
                            type="button"
                            onClick={() => removeStage(stage._key)}
                            className="rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs text-slate-400 transition hover:border-rose-300 hover:text-rose-600"
                          >
                            ✕
                          </button>
                        ) : null}
                      </div>
                    </div>

                    {/* Mode toggle */}
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => setStageMode(stage._key, 'users')}
                        className={[
                          'rounded-xl px-3 py-1.5 text-xs font-semibold transition',
                          stage.mode === 'users'
                            ? 'bg-slate-900 text-white'
                            : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
                        ].join(' ')}
                      >
                        Исполнители
                      </button>
                      <button
                        type="button"
                        onClick={() => setStageMode(stage._key, 'subblocks')}
                        className={[
                          'rounded-xl px-3 py-1.5 text-xs font-semibold transition',
                          stage.mode === 'subblocks'
                            ? 'bg-slate-900 text-white'
                            : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
                        ].join(' ')}
                      >
                        Подблоки (параллельно)
                      </button>
                    </div>

                    {/* Users mode */}
                    {stage.mode === 'users' ? (
                      <div className="mt-3">
                        <div className="mb-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                          Исполнители
                          {stage.users.length > 1
                            ? <span className="ml-1 font-normal text-slate-400">(OR — достаточно одного)</span>
                            : null}
                        </div>
                        {errors.find(e => e.field === `stages[${idx}].users`) ? (
                          <div className="mb-2 text-xs text-red-600">
                            {errors.find(e => e.field === `stages[${idx}].users`)?.message}
                          </div>
                        ) : null}
                        <UserChips
                          users={stage.users}
                          roles={roles}
                          onAdd={u => addUserToStage(stage._key, u)}
                          onRemove={id => removeUserFromStage(stage._key, id)}
                        />
                      </div>
                    ) : null}

                    {/* Subblocks mode */}
                    {stage.mode === 'subblocks' ? (
                      <div className="mt-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                            Подблоки (параллельные)
                          </div>
                          {stage.subblocks.length === 1 ? (
                            <div className="text-[11px] text-amber-600">⚠ 1 подблок — parallel GW не нужен</div>
                          ) : null}
                        </div>

                        {errors.find(e => e.field === `stages[${idx}].subblocks`) ? (
                          <div className="text-xs text-red-600">
                            {errors.find(e => e.field === `stages[${idx}].subblocks`)?.message}
                          </div>
                        ) : null}

                        {stage.subblocks.map((sb, sbi) => {
                          const sbErrors = errors.filter(e => e.field.startsWith(`stages[${idx}].subblocks[${sbi}]`))
                          return (
                            <div
                              key={sb._key}
                              className={[
                                'rounded-2xl border p-3',
                                sbErrors.length > 0 ? 'border-red-200 bg-red-50/40' : 'border-slate-200 bg-white',
                              ].join(' ')}
                            >
                              <div className="flex items-center gap-2">
                                <span className="shrink-0 text-xs font-bold text-slate-400">{sbi + 1}.</span>
                                <input
                                  value={sb.name}
                                  onChange={e => updateSubblock(stage._key, sb._key, { name: e.target.value })}
                                  placeholder="Название подблока"
                                  className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                                />
                                {stage.subblocks.length > 1 ? (
                                  <button
                                    type="button"
                                    onClick={() => removeSubblock(stage._key, sb._key)}
                                    className="rounded-lg p-1 text-slate-300 transition hover:text-rose-500"
                                  >
                                    ✕
                                  </button>
                                ) : null}
                              </div>

                              {sbErrors.map(e => (
                                <div key={e.field} className="mt-1 text-[11px] text-red-600">{e.message}</div>
                              ))}

                              <div className="mt-2.5">
                                <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                                  Исполнители
                                  {sb.users.length > 1 ? <span className="ml-1 font-normal">(OR)</span> : null}
                                </div>
                                <UserChips
                                  users={sb.users}
                                  roles={roles}
                                  onAdd={u => addUserToSubblock(stage._key, sb._key, u)}
                                  onRemove={id => removeUserFromSubblock(stage._key, sb._key, id)}
                                />
                              </div>
                            </div>
                          )
                        })}

                        <button
                          type="button"
                          onClick={() => addSubblock(stage._key)}
                          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 py-2 text-xs font-medium text-slate-500 transition hover:border-slate-400 hover:text-slate-700"
                        >
                          + Добавить подблок
                        </button>
                      </div>
                    ) : null}

                    {/* Stage-level errors (non-field) */}
                    {stageErrors.filter(e => !e.field.includes('.users') && !e.field.includes('.subblocks')).map(e => (
                      <div key={e.field} className="mt-2 text-xs text-red-600">{e.message}</div>
                    ))}
                  </div>
                )
              })}
            </div>

            <button
              type="button"
              onClick={addStage}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-3xl border border-dashed border-slate-300 py-3 text-sm font-medium text-slate-500 transition hover:border-slate-400 hover:text-slate-700"
            >
              + Добавить блок
            </button>
          </div>

          {/* Summary errors */}
          {errors.length > 0 ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
              <div className="mb-2 text-xs font-bold uppercase tracking-wider text-red-700">Исправьте ошибки перед созданием</div>
              <ul className="space-y-1">
                {errors.map((e, i) => (
                  <li key={i} className="text-xs text-red-700">• {e.message}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-6 py-4">
          <div className="text-xs text-slate-400">
            Генерирует BPMN XML и сохраняет как Draft
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={submitting}
              className="rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? 'Создание...' : 'Создать шаблон'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
