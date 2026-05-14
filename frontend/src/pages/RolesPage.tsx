import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { createRole, getRoles } from '../api/roles'
import { getCompanies } from '../api/companies'
import { Modal } from '../components/Modal'
import { useAuth } from '../hooks/useAuth'
import { showToast } from '../lib/toast'

export function RolesPage() {
  const queryClient = useQueryClient()
  const user = useAuth((state) => state.user)
  const [companyId, setCompanyId] = useState<string>('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [name, setName] = useState('')
  const [flowableGroup, setFlowableGroup] = useState('')

  const companiesQuery = useQuery({ queryKey: ['companies'], queryFn: getCompanies })

  useEffect(() => {
    if (!companyId) {
      const fallback = user?.company_id ?? companiesQuery.data?.[0]?.id ?? ''
      setCompanyId(fallback)
    }
  }, [companiesQuery.data, companyId, user?.company_id])

  const rolesQuery = useQuery({
    queryKey: ['roles', companyId],
    queryFn: () => getRoles(companyId),
    enabled: Boolean(companyId),
  })

  const selectedCompany = useMemo(() => companiesQuery.data?.find((item) => item.id === companyId), [companiesQuery.data, companyId])

  const createMutation = useMutation({
    mutationFn: createRole,
    onSuccess: async () => {
      showToast('Роль создана')
      setIsModalOpen(false)
      setName('')
      setFlowableGroup('')
      await queryClient.invalidateQueries({ queryKey: ['roles', companyId] })
    },
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-slate-950">Роли</h1>
          <p className="mt-2 text-sm text-slate-500">Выберите компанию и управляйте Flowable-группами.</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={companyId}
            onChange={(event) => setCompanyId(event.target.value)}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
          >
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
            disabled={!companyId}
            className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            Создать роль
          </button>
        </div>
      </div>

      {selectedCompany ? <div className="text-sm text-slate-500">Компания: {selectedCompany.name}</div> : null}

      {rolesQuery.isLoading ? <div className="text-slate-500">Загрузка...</div> : null}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {rolesQuery.data?.map((role) => (
          <div key={role.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xl shadow-slate-900/5">
            <div className="text-xs uppercase tracking-[0.35em] text-slate-400">Role</div>
            <div className="mt-3 text-lg font-semibold text-slate-950">{role.name}</div>
            <div className="mt-1 text-sm text-slate-500">group: {role.flowable_group}</div>
          </div>
        ))}
      </div>

      {isModalOpen ? (
        <Modal title="Создать роль" onClose={() => setIsModalOpen(false)}>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault()
              if (!companyId) {
                return
              }
              createMutation.mutate({ name, flowable_group: flowableGroup, company_id: companyId })
            }}
          >
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Название</span>
              <input value={name} onChange={(event) => setName(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" required />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Flowable group</span>
              <input value={flowableGroup} onChange={(event) => setFlowableGroup(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" required />
            </label>
            <button type="submit" className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white">
              {createMutation.isPending ? 'Создание...' : 'Создать'}
            </button>
          </form>
        </Modal>
      ) : null}
    </div>
  )
}
