import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { getCompanies } from '../api/companies'
import { getProcesses, startProcess } from '../api/instances'
import { getTemplates } from '../api/templates'
import { Modal } from '../components/Modal'
import { useAuth } from '../hooks/useAuth'
import { showToast } from '../lib/toast'
import type { TemplateRead } from '../types/api'

interface ProcessVariableRow {
  id: string
  name: string
  value: string
  type: 'string' | 'integer' | 'boolean'
  locked?: boolean
}

function buildDefaultVariables(currentUserId: string): ProcessVariableRow[] {
  return [
    { id: 'var-amount', name: 'amount', value: '75', type: 'integer' },
    { id: 'var-initiatorUserId', name: 'initiatorUserId', value: currentUserId, type: 'string', locked: true },
  ]
}

function generateVariableId(): string {
  return 'var-' + Math.random().toString(36).substr(2, 9)
}

export function ProcessesPage() {
  const queryClient = useQueryClient()
  const user = useAuth((state) => state.user)
  const [companyId, setCompanyId] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedTemplateKey, setSelectedTemplateKey] = useState('')
  const [name, setName] = useState('')
  const [variables, setVariables] = useState<ProcessVariableRow[]>(buildDefaultVariables(user?.id ?? ''))

  const companiesQuery = useQuery({ queryKey: ['companies'], queryFn: getCompanies })
  const templatesQuery = useQuery({ queryKey: ['templates'], queryFn: getTemplates })

  const availableTemplates = useMemo(() => {
    const deployed = templatesQuery.data?.filter((template) => template.status === 'DEPLOYED') ?? []
    return deployed.length > 0 ? deployed : templatesQuery.data ?? []
  }, [templatesQuery.data])

  const selectedTemplate = useMemo<TemplateRead | undefined>(
    () => availableTemplates.find((template) => template.process_definition_key === selectedTemplateKey),
    [availableTemplates, selectedTemplateKey],
  )

  useEffect(() => {
    if (!companyId) {
      setCompanyId(user?.company_id ?? companiesQuery.data?.[0]?.id ?? '')
    }
  }, [companiesQuery.data, companyId, user?.company_id])

  useEffect(() => {
    if (!availableTemplates.length || selectedTemplateKey) {
      return
    }

    const firstTemplate = availableTemplates[0]
    setSelectedTemplateKey(firstTemplate.process_definition_key)
    setName(firstTemplate.name)
  }, [availableTemplates, selectedTemplateKey])

  useEffect(() => {
    setVariables((current) =>
      current.map((row) => {
        if (row.name !== 'initiatorUserId') {
          return row
        }
        return { ...row, value: user?.id ?? '' }
      }),
    )
  }, [user?.id])

  useEffect(() => {
    if (selectedTemplate) {
      setName(selectedTemplate.name)
    }
  }, [selectedTemplate])

  const processesQuery = useQuery({
    queryKey: ['processes', companyId],
    queryFn: () => getProcesses(companyId || undefined),
    enabled: Boolean(companyId),
  })

  const selectedCompany = useMemo(() => companiesQuery.data?.find((item) => item.id === companyId), [companiesQuery.data, companyId])

  const mutation = useMutation({
    mutationFn: startProcess,
    onSuccess: async () => {
      showToast('Процесс запущен')
      setIsModalOpen(false)
      setVariables(buildDefaultVariables(user?.id ?? ''))
      if (selectedTemplate) {
        setName(selectedTemplate.name)
      }
      await queryClient.invalidateQueries({ queryKey: ['processes', companyId] })
    },
  })

  const buildVariables = () => {
    return variables
      .filter((row) => row.name.trim())
      .map((row) => {
        if (row.type === 'integer') {
          return { name: row.name, value: Number(row.value), type: row.type }
        }

        if (row.type === 'boolean') {
          return { name: row.name, value: row.value === 'true', type: row.type }
        }

        return { name: row.name, value: row.value, type: row.type }
      })
  }

  const handleVariableChange = (index: number, field: 'name' | 'value' | 'type', newValue: string) => {
    setVariables((current) =>
      current.map((row, rowIndex) => {
        if (rowIndex !== index) return row
        if (field === 'type') {
          return { ...row, type: newValue as 'string' | 'integer' | 'boolean', value: '' }
        }
        return { ...row, [field]: newValue }
      }),
    )
  }

  const handleAddVariable = () => {
    setVariables((current) => [
      ...current,
      { id: generateVariableId(), name: '', value: '', type: 'string' },
    ])
  }

  const handleRemoveVariable = (index: number) => {
    setVariables((current) => current.filter((_, i) => i !== index))
  }

  const processOptions = templatesQuery.data ?? []

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-slate-950">Процессы</h1>
          <p className="mt-2 text-sm text-slate-500">Запуск и мониторинг экземпляров процессов.</p>
        </div>
        <div className="flex items-center gap-3">
          <select value={companyId} onChange={(event) => setCompanyId(event.target.value)} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm">
            <option value="">Выберите компанию</option>
            {companiesQuery.data?.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            disabled={!companyId || processOptions.length === 0}
            className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            Запустить процесс
          </button>
        </div>
      </div>

      {selectedCompany ? <div className="text-sm text-slate-500">Компания: {selectedCompany.name}</div> : null}
      {processesQuery.isLoading ? <div className="text-slate-500">Загрузка...</div> : null}

      <div className="space-y-4">
        {processesQuery.data?.items.map((process) => (
          <div key={process.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xl shadow-slate-900/5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.35em] text-slate-400">Process</div>
                <div className="mt-2 text-lg font-semibold text-slate-950">{process.name}</div>
                <div className="mt-1 text-sm text-slate-500">{process.process_definition_key}</div>
              </div>
              <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-slate-600">
                {process.status}
              </div>
            </div>
            <div className="mt-4 grid gap-3 text-sm text-slate-600 md:grid-cols-2 xl:grid-cols-4">
              <div>Активные задачи: {process.current_activities.length ? process.current_activities.join(', ') : '—'}</div>
              <div>Запущен: {new Date(process.start_time).toLocaleString('ru-RU')}</div>
              <div>Flowable ID: {process.flowable_process_instance_id}</div>
              <div>Business key: {process.business_key}</div>
            </div>
            <div className="mt-4 flex justify-end">
              <Link to={`/processes/${process.id}`} className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700">
                Подробнее
              </Link>
            </div>
          </div>
        ))}
      </div>

      {isModalOpen ? (
        <Modal title="Запустить процесс" onClose={() => setIsModalOpen(false)}>
          <form
            className="space-y-4 max-h-[70vh] overflow-y-auto pr-1"
            onSubmit={(event) => {
              event.preventDefault()
              if (!companyId || !selectedTemplateKey) {
                return
              }

              const hasEmptyVariableNames = variables.some((v) => !v.locked && v.name.trim() === '')
              const hasEmptyVariableValues = variables.some((v) => v.name.trim() && v.value.trim() === '')

              if (hasEmptyVariableNames || hasEmptyVariableValues) {
                showToast('Заполните все поля переменных', 'error')
                return
              }

              mutation.mutate({
                process_definition_key: selectedTemplateKey,
                name,
                company_id: companyId,
                variables: buildVariables(),
              })
            }}
          >
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Доступный процесс</span>
              <select
                value={selectedTemplateKey}
                onChange={(event) => {
                  const processKey = event.target.value
                  setSelectedTemplateKey(processKey)
                  const template = processOptions.find((item) => item.process_definition_key === processKey)
                  if (template) {
                    setName(template.name)
                  }
                }}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                required
              >
                <option value="">Выберите процесс</option>
                {processOptions.map((template) => (
                  <option key={template.id} value={template.process_definition_key}>
                    {template.name} · {template.process_definition_key}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Process definition key</span>
              <input value={selectedTemplateKey} readOnly className="w-full rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3 text-slate-500" />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Название экземпляра</span>
              <input value={name} onChange={(event) => setName(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" required />
            </label>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-700">Переменные</span>
                <span className="text-xs text-slate-400">initiatorUserId — статичная переменная</span>
              </div>

              <div className="space-y-2">
                {variables.map((row, index) => (
                  <div key={row.id} className="grid grid-cols-12 gap-2 items-center">
                    <input
                      value={row.name}
                      onChange={(event) => handleVariableChange(index, 'name', event.target.value)}
                      readOnly={row.locked}
                      placeholder="Имя переменной"
                      className={[
                        'col-span-3 rounded-xl border px-3 py-2 text-sm',
                        row.locked ? 'border-slate-200 bg-slate-100 text-slate-500' : 'border-slate-200 bg-slate-50',
                      ].join(' ')}
                      required={!row.locked}
                    />

                    {row.type === 'integer' ? (
                      <input
                        type="number"
                        value={row.value}
                        onChange={(event) => handleVariableChange(index, 'value', event.target.value)}
                        readOnly={row.locked}
                        className={[
                          'col-span-4 rounded-xl border px-3 py-2 text-sm',
                          row.locked ? 'border-slate-200 bg-slate-100 text-slate-500' : 'border-slate-200 bg-slate-50',
                        ].join(' ')}
                        required
                      />
                    ) : row.type === 'boolean' ? (
                      <select
                        value={row.value}
                        onChange={(event) => handleVariableChange(index, 'value', event.target.value)}
                        disabled={row.locked}
                        className={[
                          'col-span-4 rounded-xl border px-3 py-2 text-sm',
                          row.locked ? 'border-slate-200 bg-slate-100 text-slate-500' : 'border-slate-200 bg-slate-50',
                        ].join(' ')}
                        required
                      >
                        <option value="">— выберите —</option>
                        <option value="true">true</option>
                        <option value="false">false</option>
                      </select>
                    ) : (
                      <input
                        value={row.value}
                        onChange={(event) => handleVariableChange(index, 'value', event.target.value)}
                        readOnly={row.locked}
                        placeholder="Значение"
                        className={[
                          'col-span-4 rounded-xl border px-3 py-2 text-sm',
                          row.locked ? 'border-slate-200 bg-slate-100 text-slate-500' : 'border-slate-200 bg-slate-50',
                        ].join(' ')}
                        required
                      />
                    )}

                    <select
                      value={row.type}
                      onChange={(event) => handleVariableChange(index, 'type', event.target.value)}
                      disabled={row.locked}
                      className={[
                        'col-span-3 rounded-xl border px-3 py-2 text-sm',
                        row.locked ? 'border-slate-200 bg-slate-100 text-slate-500' : 'border-slate-200 bg-slate-50',
                      ].join(' ')}
                    >
                      <option value="string">string</option>
                      <option value="integer">integer</option>
                      <option value="boolean">boolean</option>
                    </select>

                    {!row.locked ? (
                      <button
                        type="button"
                        onClick={() => handleRemoveVariable(index)}
                        className="col-span-2 rounded-xl border border-rose-200 bg-rose-50 px-2 py-2 text-xs font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-100"
                      >
                        Удалить
                      </button>
                    ) : (
                      <div className="col-span-2" />
                    )}
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={handleAddVariable}
                className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
              >
                + Добавить переменную
              </button>
            </div>

            <button type="submit" className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white">
              {mutation.isPending ? 'Запуск...' : 'Запустить'}
            </button>
          </form>
        </Modal>
      ) : null}
    </div>
  )
}