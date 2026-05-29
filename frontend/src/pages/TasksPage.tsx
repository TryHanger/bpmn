import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { claimTask, completeTask, completeTaskWithRemark, getMyTasks, rejectTask } from '../api/tasks'
import { showToast } from '../lib/toast'
import { useState } from 'react'

export function TasksPage() {
  const queryClient = useQueryClient()
  const previousAvailableIds = useRef<Set<string>>(new Set())
  const [remarkTaskId, setRemarkTaskId] = useState<string | null>(null)
  const [remarkTaskKey, setRemarkTaskKey] = useState<string>('')
  const [remarkTaskName, setRemarkTaskName] = useState<string>('')
  const [remarkText, setRemarkText] = useState('')
  const tasksQuery = useQuery({
    queryKey: ['tasks', 'my'],
    queryFn: getMyTasks,
    refetchInterval: 5000,
  })

  useEffect(() => {
    const available = tasksQuery.data?.available ?? []
    if (previousAvailableIds.current.size > 0) {
      available.forEach((task) => {
        if (!previousAvailableIds.current.has(task.id)) {
          showToast(`Новая задача: ${task.name ?? task.id}`)
        }
      })
    }
    previousAvailableIds.current = new Set(available.map((task) => task.id))
  }, [tasksQuery.data])

  const claimMutation = useMutation({
    mutationFn: claimTask,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['tasks', 'my'] })
    },
  })

  const completeMutation = useMutation({
    mutationFn: ({ taskId, outcome }: { taskId: string; outcome: 'approved' | 'rejected' }) => completeTask(taskId, { outcome }),
    onSuccess: async () => {
      showToast('Задача завершена')
      await queryClient.invalidateQueries({ queryKey: ['tasks', 'my'] })
    },
  })

  const rejectMutation = useMutation({
    mutationFn: (taskId: string) => rejectTask(taskId),
    onSuccess: async () => {
      showToast('Процесс отклонён и завершён', 'success')
      await queryClient.invalidateQueries({ queryKey: ['tasks'] })
      await queryClient.invalidateQueries({ queryKey: ['processes'] })
    },
    onError: () => {
      showToast('Ошибка при отклонении', 'error')
    },
  })

  const handleReject = (taskId: string) => {
    const confirmed = window.confirm('Отклонить процесс? Весь процесс будет завершён и все активные задачи закроются.')
    if (!confirmed) return
    rejectMutation.mutate(taskId)
  }

  const remarkMutation = useMutation({
    mutationFn: () =>
      completeTaskWithRemark(remarkTaskId!, {
        task_definition_key: remarkTaskKey,
        task_name: remarkTaskName || undefined,
        remark: remarkText.trim(),
        variables: [],
      }),
    onSuccess: async () => {
      showToast('Задача завершена с замечанием', 'success')
      setRemarkTaskId(null)
      setRemarkText('')
      setRemarkTaskKey('')
      setRemarkTaskName('')
      await queryClient.invalidateQueries({ queryKey: ['tasks', 'my'] })
    },
    onError: () => {
      showToast('Ошибка завершения с замечанием', 'error')
    },
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold text-slate-950">Задачи</h1>
        <p className="mt-2 text-sm text-slate-500">Доступные и взятые задачи сотрудника.</p>
      </div>

      {tasksQuery.isLoading ? <div className="text-slate-500">Загрузка...</div> : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-xl shadow-slate-900/5">
          <h2 className="text-xl font-semibold text-slate-950">Доступные задачи</h2>
          <div className="space-y-3">
            {tasksQuery.data?.available.map((task) => (
              <div key={task.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-base font-semibold text-slate-900">{task.name ?? task.id}</div>
                <div className="mt-1 text-sm text-slate-500">{task.processName ?? '—'}</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link to={`/tasks/${task.id}`} className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700">
                    Открыть
                  </Link>
                  <button
                    type="button"
                    onClick={() => claimMutation.mutate(task.id)}
                    disabled={claimMutation.isPending}
                    className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    Взять задачу
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-xl shadow-slate-900/5">
          <h2 className="text-xl font-semibold text-slate-950">Мои задачи</h2>
          <div className="space-y-3">
            {tasksQuery.data?.claimed.map((task) => (
              <div key={task.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-base font-semibold text-slate-900">{task.name ?? task.id}</div>
                <div className="mt-1 text-sm text-slate-500">{task.processName ?? '—'}</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link to={`/tasks/${task.id}`} className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700">
                    Открыть
                  </Link>
                  <button
                    type="button"
                    onClick={() => completeMutation.mutate({ taskId: task.id, outcome: 'approved' })}
                    disabled={completeMutation.isPending}
                    className="rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    Одобрить
                  </button>
                  <button
                    type="button"
                    onClick={() => handleReject(task.id)}
                    disabled={rejectMutation.isPending}
                    className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {rejectMutation.isPending ? 'Завершение...' : 'Отклонить'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRemarkTaskId(task.id)
                      setRemarkTaskKey(task.taskDefinitionKey ?? '')
                      setRemarkTaskName(task.name ?? '')
                      setRemarkText('')
                    }}
                    className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700 transition hover:border-amber-300 hover:bg-amber-100"
                  >
                    ⚠ С замечанием
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {remarkTaskId ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 backdrop-blur-sm"
          onClick={() => setRemarkTaskId(null)}
        >
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <h2 className="text-xl font-semibold text-slate-900">Завершить с замечанием</h2>
            <p className="mt-1 text-sm text-slate-500">Задача будет выполнена. Замечание сохранится в истории процесса.</p>

            <div className="mt-4">
              <label className="mb-2 block text-sm font-medium text-slate-700">Замечание *</label>
              <textarea
                value={remarkText}
                onChange={(event) => setRemarkText(event.target.value)}
                placeholder="Опишите замечание..."
                rows={4}
                className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
                autoFocus
              />
            </div>

            <div className="mt-4 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setRemarkTaskId(null)
                  setRemarkText('')
                  setRemarkTaskKey('')
                  setRemarkTaskName('')
                }}
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => remarkMutation.mutate()}
                disabled={!remarkText.trim() || remarkMutation.isPending}
                className="rounded-2xl bg-amber-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {remarkMutation.isPending ? 'Сохранение...' : 'Завершить с замечанием'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
