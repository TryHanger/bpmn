import type { ActivityStatus } from '../types/api'

interface ActivityTimelineProps {
  activities: ActivityStatus[]
}

const labels: Record<ActivityStatus['status'], string> = {
  pending: 'Ожидает',
  active: 'Выполняется',
  completed: 'Выполнено',
  rejected: 'Прервано',
  skipped: 'Пропущено',
  interrupted: 'Прервано',
}

const colors: Record<ActivityStatus['status'], string> = {
  pending: 'border-slate-200 bg-slate-50 text-slate-600',
  active: 'border-blue-200 bg-blue-50 text-blue-700',
  completed: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  rejected: 'border-red-200 bg-red-50 text-red-700',
  skipped: 'border-slate-300 bg-slate-100 text-slate-500',
  interrupted: 'border-amber-200 bg-amber-50 text-amber-700',
}

function formatTime(value: string | null): string {
  if (!value) {
    return '—'
  }
  return new Date(value).toLocaleString('ru-RU')
}

export function ActivityTimeline({ activities }: ActivityTimelineProps) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-xl shadow-slate-900/5">
      <div className="mb-4 text-sm font-semibold uppercase tracking-[0.3em] text-slate-400">Этапы процесса</div>
      <div className="space-y-3">
        {activities.map((activity) => (
          <div key={activity.activityId} className={`rounded-2xl border p-4 ${colors[activity.status]}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-900">{activity.activityName || activity.activityId}</div>
                <div className="mt-1 text-xs uppercase tracking-[0.25em]">{labels[activity.status]}</div>
              </div>
              <div className="text-xs text-slate-500">{activity.assignee ?? '—'}</div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
              <div>Старт: {formatTime(activity.startTime)}</div>
              <div>Финиш: {formatTime(activity.endTime)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
