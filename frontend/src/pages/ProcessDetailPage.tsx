import { useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'

import { getProcesses, getProcessState } from '../api/instances'
import { ActivityTimeline } from '../components/ActivityTimeline'
import { ProcessViewer } from '../components/ProcessViewer'

export function ProcessDetailPage() {
  const { id } = useParams<{ id: string }>()

  const processesQuery = useQuery({
    queryKey: ['processes'],
    queryFn: () => getProcesses(),
  })

  const process = useMemo(() => processesQuery.data?.items.find((item) => item.id === id), [id, processesQuery.data])

  const stateQuery = useQuery({
    queryKey: ['process-state', id],
    queryFn: () => getProcessState(id ?? ''),
    enabled: Boolean(id),
    refetchInterval: process?.status === 'running' ? 4000 : false,
  })

  if (processesQuery.isLoading || stateQuery.isLoading) {
    return <div className="text-slate-500">Загрузка...</div>
  }

  if (!process || !stateQuery.data) {
    return <div className="rounded-3xl border border-slate-200 bg-white p-6 text-slate-600 shadow-xl shadow-slate-900/5">Процесс не найден.</div>
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-900/5">
        <div className="text-xs uppercase tracking-[0.35em] text-slate-400">Process detail</div>
        <h1 className="mt-3 text-3xl font-semibold text-slate-950">{process.name}</h1>
        <div className="mt-2 text-sm text-slate-500">{process.process_definition_key} · {process.status}</div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <ProcessViewer instanceId={process.id} xmlTemplate={process.xml_template ?? ''} activities={stateQuery.data.activities} />
        <ActivityTimeline activities={stateQuery.data.activities} />
      </div>
    </div>
  )
}
