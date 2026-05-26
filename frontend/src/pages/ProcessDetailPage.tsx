import { useMemo } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'

import { getProcesses } from '../api/instances'

export function ProcessDetailPage() {
  const { id } = useParams<{ id: string }>()

  const processesQuery = useQuery({
    queryKey: ['processes'],
    queryFn: () => getProcesses(),
  })

  const process = useMemo(() => processesQuery.data?.items.find((item) => item.id === id), [id, processesQuery.data])

  if (processesQuery.isLoading) {
    return <div className="text-slate-500">Загрузка...</div>
  }

  if (!process) {
    return <div className="rounded-3xl border border-slate-200 bg-white p-6 text-slate-600 shadow-xl shadow-slate-900/5">Процесс не найден.</div>
  }

  return <Navigate to={`/audit/${process.flowable_process_instance_id}`} replace />
}
