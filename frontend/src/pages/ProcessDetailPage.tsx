import { useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'

import { getProcesses, getProcessState } from '../api/instances'
import { ActivityTimeline } from '../components/ActivityTimeline'
import { ProcessViewer } from '../components/ProcessViewer'
import type { ProcessVariable } from '../types/api'

function formatVariableValue(variable: ProcessVariable) {
  if (variable.type === 'boolean') {
    const isTrue = variable.value === true || variable.value === 'true'
    return (
      <span
        className={`inline-flex items-center rounded-full border px-2 py-1 text-xs font-semibold ${
          isTrue ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'
        }`}
      >
        {isTrue ? '✓ true' : '✗ false'}
      </span>
    )
  }

  if (variable.type === 'integer') {
    return <span className="font-mono text-sm text-slate-800">{String(variable.value ?? '—')}</span>
  }

  return <span className="text-sm text-slate-700">{String(variable.value ?? '—')}</span>
}

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
        <ProcessViewer
          instanceId={process.id}
          xmlTemplate={process.xml_template ?? ''}
          activities={stateQuery.data.activities}
          childInstances={stateQuery.data.child_instances}
        />

        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-xl shadow-slate-900/5">
            <div className="mb-4 text-sm font-semibold uppercase tracking-[0.3em] text-slate-400">Переменные процесса</div>
            {stateQuery.data.variables.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">Переменные отсутствуют.</div>
            ) : (
              <div className="space-y-3">
                {stateQuery.data.variables.map((variable) => (
                  <div key={variable.name} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{variable.name}</div>
                        <div className="mt-1 text-xs uppercase tracking-[0.25em] text-slate-400">{variable.type}</div>
                      </div>
                      {formatVariableValue(variable)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <ActivityTimeline activities={stateQuery.data.activities} />
        </div>
      </div>
    </div>
  )
}
