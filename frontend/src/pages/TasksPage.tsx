import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { claimTask, completeTask, getMyTasks } from '../api/tasks'
import { showToast } from '../lib/toast'

export function TasksPage() {
  const queryClient = useQueryClient()
  const previousAvailableIds = useRef<Set<string>>(new Set())
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
                    onClick={() => completeMutation.mutate({ taskId: task.id, outcome: 'rejected' })}
                    disabled={completeMutation.isPending}
                    className="rounded-2xl bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    Отклонить
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
