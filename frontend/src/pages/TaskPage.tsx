import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { getEmployees } from '../api/employees'
import { claimTask, completeTask, getTaskContext } from '../api/tasks'
import { useAuth } from '../hooks/useAuth'
import { showToast } from '../lib/toast'
import type { ProcessSchemaRead } from '../types/api'

type WritableValue = string | boolean

export function TaskPage() {
  const { taskId = '' } = useParams<{ taskId: string }>()
  const queryClient = useQueryClient()
  const user = useAuth((state) => state.user)
  const [values, setValues] = useState<Record<string, WritableValue>>({})

  const employeesQuery = useQuery({
    queryKey: ['employees', user?.company_id],
    queryFn: () => getEmployees(user?.company_id ?? ''),
    enabled: Boolean(user?.company_id),
  })

  const contextQuery = useQuery({
    queryKey: ['task-context', taskId],
    queryFn: () => getTaskContext(taskId),
    enabled: Boolean(taskId),
  })

  const currentEmployee = useMemo(
    () => employeesQuery.data?.find((employee) => employee.id === user?.employee_id) ?? null,
    [employeesQuery.data, user?.employee_id],
  )

  const currentRoleName = currentEmployee?.flowable_group ?? currentEmployee?.role_name ?? null
  const schema = contextQuery.data?.schema ?? null
  const schemaRole = useMemo(
    () => schema?.roles.find((role) => role.role_name === currentRoleName) ?? null,
    [currentRoleName, schema],
  )

  const writableVars = schemaRole?.variables ?? []
  const readableVars = useMemo(() => {
    if (!schema || !currentRoleName) {
      return []
    }

    return schema.roles.flatMap((role) => role.variables).filter((variable) => variable.readable_by_roles.includes(currentRoleName))
  }, [currentRoleName, schema])

  useEffect(() => {
    if (!contextQuery.data || !schemaRole) {
      setValues({})
      return
    }

    const nextValues: Record<string, WritableValue> = {}
    schemaRole.variables.forEach((variable) => {
      const value = contextQuery.data?.variables?.[variable.name]
      if (variable.type === 'boolean') {
        nextValues[variable.name] = typeof value === 'string' ? value.toLowerCase() === 'true' : Boolean(value)
      } else {
        nextValues[variable.name] = value == null ? '' : String(value)
      }
    })
    setValues(nextValues)
  }, [contextQuery.data, schemaRole])

  const claimMutation = useMutation({
    mutationFn: () => claimTask(taskId),
    onSuccess: async () => {
      showToast('Задача взята', 'success')
      await queryClient.invalidateQueries({ queryKey: ['task-context', taskId] })
    },
    onError: () => {
      showToast('Не удалось взять задачу', 'error')
    },
  })

  const completeMutation = useMutation({
    mutationFn: (outcome: 'approved' | 'rejected') => {
      const variables = writableVars.map((variable) => ({
        name: variable.name,
        type: variable.type,
        value: variable.type === 'integer' ? Number(values[variable.name] ?? 0) : variable.type === 'boolean' ? Boolean(values[variable.name]) : String(values[variable.name] ?? ''),
      }))

      return completeTask(taskId, writableVars.length > 0 ? { outcome, variables } : { outcome })
    },
    onSuccess: async () => {
      showToast('Задача завершена', 'success')
      await queryClient.invalidateQueries({ queryKey: ['task-context', taskId] })
    },
    onError: () => {
      showToast('Не удалось завершить задачу', 'error')
    },
  })

  const handleComplete = async (outcome: 'approved' | 'rejected') => {
    if (writableVars.some((variable) => variable.required && (values[variable.name] === '' || values[variable.name] == null))) {
      showToast('Заполните обязательные поля', 'error')
      return
    }

    await completeMutation.mutateAsync(outcome)
  }

  const currentAssignee = contextQuery.data?.task.assignee
  const canClaim = Boolean(contextQuery.data?.task.id) && Boolean(user?.employee_id) && currentAssignee !== user?.employee_id

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Link to="/tasks" className="text-sm font-semibold text-slate-500 hover:text-slate-900">
            ← К задачам
          </Link>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950">Задача</h1>
          <p className="mt-2 text-sm text-slate-500">Динамическая форма по схеме процесса.</p>
        </div>
        {canClaim ? (
          <button type="button" onClick={() => claimMutation.mutate()} disabled={claimMutation.isPending} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 disabled:opacity-60">
            {claimMutation.isPending ? 'Берём...' : 'Взять задачу'}
          </button>
        ) : null}
      </div>

      {!taskId ? <div className="rounded-3xl border border-slate-200 bg-white p-5 text-sm text-slate-500">Не указан идентификатор задачи.</div> : null}
      {employeesQuery.isLoading || contextQuery.isLoading ? <div className="text-slate-500">Загрузка...</div> : null}

      {contextQuery.data ? (
        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <section className="space-y-4 rounded-3xl border border-white/70 bg-white/85 p-5 shadow-xl shadow-slate-900/5 backdrop-blur">
            <div>
              <div className="text-xs uppercase tracking-[0.35em] text-slate-400">Task</div>
              <div className="mt-2 text-2xl font-semibold text-slate-950">{contextQuery.data.task.name ?? contextQuery.data.task.id}</div>
              <div className="mt-2 text-sm text-slate-500">{contextQuery.data.task.processName ?? '—'}</div>
            </div>

            {readableVars.length > 0 ? (
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-sm font-semibold text-slate-900">Информация</div>
                <div className="mt-3 space-y-2">
                  {readableVars.map((variable) => (
                    <div key={variable.id} className="flex items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3">
                      <div>
                        <div className="text-sm font-medium text-slate-800">{variable.label}</div>
                        <div className="font-mono text-xs text-slate-500">{variable.name}</div>
                      </div>
                      <div className="text-sm text-slate-700">{String(contextQuery.data?.variables?.[variable.name] ?? '—')}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {schemaRole ? (
              <div className="rounded-3xl border border-slate-200 bg-white p-4">
                <div className="text-sm font-semibold text-slate-900">Ваши данные</div>
                <div className="mt-3 space-y-3">
                  {schemaRole.variables.map((variable) => (
                    <label key={variable.id} className="block">
                      <span className="mb-2 block text-sm font-medium text-slate-700">{variable.label}</span>
                      {variable.type === 'boolean' ? (
                        <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                          <input
                            type="checkbox"
                            checked={Boolean(values[variable.name])}
                            onChange={(event) => setValues((current) => ({ ...current, [variable.name]: event.target.checked }))}
                          />
                          <span className="text-sm text-slate-700">Да / Нет</span>
                        </label>
                      ) : (
                        <input
                          type={variable.type === 'integer' ? 'number' : 'text'}
                          value={String(values[variable.name] ?? '')}
                          onChange={(event) => setValues((current) => ({ ...current, [variable.name]: event.target.value }))}
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                        />
                      )}
                    </label>
                  ))}
                </div>
              </div>
            ) : null}
          </section>

          <aside className="space-y-4 rounded-3xl border border-white/70 bg-white/85 p-5 shadow-xl shadow-slate-900/5 backdrop-blur">
            <div className="text-xs uppercase tracking-[0.35em] text-slate-400">Context</div>
            <div className="space-y-2 text-sm text-slate-600">
              <div>Task ID: {contextQuery.data.task.id}</div>
              <div>Assignee: {contextQuery.data.task.assignee ?? '—'}</div>
              <div>Definition: {contextQuery.data.task.processDefinitionId ?? '—'}</div>
            </div>

            {schema ? (
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-sm font-semibold text-slate-900">Схема: {schema.name}</div>
                <div className="mt-2 text-sm text-slate-500">{schema.description ?? 'Без описания'}</div>
                <div className="mt-4 text-sm text-slate-700">Роль шага: {schemaRole?.display_name ?? currentRoleName ?? '—'}</div>
              </div>
            ) : (
              <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">К этой задаче схема не привязана.</div>
            )}

            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => handleComplete('approved')} disabled={completeMutation.isPending} className="rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">
                Одобрить
              </button>
              <button type="button" onClick={() => handleComplete('rejected')} disabled={completeMutation.isPending} className="rounded-2xl bg-red-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">
                Отклонить
              </button>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  )
}

export default TaskPage
