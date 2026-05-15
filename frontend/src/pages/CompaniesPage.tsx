import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { createCompany, getCompanies } from '../api/companies'
import { createEmployee, getEmployees } from '../api/employees'
import { createRole, getRoles } from '../api/roles'
import { Modal } from '../components/Modal'
import { useAuth } from '../hooks/useAuth'
import { showToast } from '../lib/toast'

type WorkspaceTab = 'companies' | 'roles' | 'employees'

export function CompaniesPage() {
  const queryClient = useQueryClient()
  const user = useAuth((state) => state.user)
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('companies')
  const [selectedCompanyId, setSelectedCompanyId] = useState('')
  const [isCompanyModalOpen, setIsCompanyModalOpen] = useState(false)
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false)
  const [name, setName] = useState('')
  const [flowableGroup, setFlowableGroup] = useState('')
  const [roleCompanyId, setRoleCompanyId] = useState('')
  const [isEmployeeModalOpen, setIsEmployeeModalOpen] = useState(false)
  const [employeeName, setEmployeeName] = useState('')
  const [employeeRoleId, setEmployeeRoleId] = useState('')
  const [employeePhone, setEmployeePhone] = useState('')

  const companiesQuery = useQuery({
    queryKey: ['companies'],
    queryFn: getCompanies,
  })

  useEffect(() => {
    if (selectedCompanyId) {
      return
    }

    const fallbackCompanyId = user?.company_id ?? companiesQuery.data?.[0]?.id ?? ''
    if (fallbackCompanyId) {
      setSelectedCompanyId(fallbackCompanyId)
      setRoleCompanyId(fallbackCompanyId)
    }
  }, [companiesQuery.data, selectedCompanyId, user?.company_id])

  useEffect(() => {
    if (!roleCompanyId && selectedCompanyId) {
      setRoleCompanyId(selectedCompanyId)
    }
  }, [roleCompanyId, selectedCompanyId])

  const selectedCompany = useMemo(
    () => companiesQuery.data?.find((company) => company.id === selectedCompanyId),
    [companiesQuery.data, selectedCompanyId],
  )

  const rolesQuery = useQuery({
    queryKey: ['roles', roleCompanyId],
    queryFn: () => getRoles(roleCompanyId),
    enabled: Boolean(roleCompanyId),
  })

  const employeesQuery = useQuery({
    queryKey: ['employees', selectedCompanyId],
    queryFn: () => getEmployees(selectedCompanyId),
    enabled: Boolean(selectedCompanyId),
  })

  const activeCompanyRoles = rolesQuery.data ?? []

  const createMutation = useMutation({
    mutationFn: createCompany,
    onSuccess: async (company) => {
      showToast('Компания создана')
      setIsCompanyModalOpen(false)
      setName('')
      setSelectedCompanyId(company.id)
      setRoleCompanyId(company.id)
      setActiveTab('roles')
      await queryClient.invalidateQueries({ queryKey: ['companies'] })
    },
  })

  const createRoleMutation = useMutation({
    mutationFn: createRole,
    onSuccess: async () => {
      showToast('Роль создана')
      setIsRoleModalOpen(false)
      setName('')
      setFlowableGroup('')
      await queryClient.invalidateQueries({ queryKey: ['roles', roleCompanyId] })
      await queryClient.invalidateQueries({ queryKey: ['companies'] })
    },
  })

  const createEmployeeMutation = useMutation({
    mutationFn: createEmployee,
    onSuccess: async () => {
      showToast('Сотрудник создан')
      setIsEmployeeModalOpen(false)
      setEmployeeName('')
      setEmployeeRoleId('')
      await queryClient.invalidateQueries({ queryKey: ['employees', selectedCompanyId] })
    },
  })

  return (
    <div className="space-y-6">
      <div className="rounded-[2rem] border border-white/70 bg-white/80 p-6 shadow-xl shadow-slate-900/5 backdrop-blur">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.35em] text-slate-400">Company workspace</div>
            <h1 className="mt-2 text-3xl font-semibold text-slate-950">Компании, роли и сотрудники</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-500">
              Создавайте компании, назначайте роли для выбранной компании и добавляйте сотрудников в одном рабочем месте.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsCompanyModalOpen(true)}
            className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-700"
          >
            Создать компанию
          </button>
        </div>

        <div className="mt-6 flex flex-wrap gap-2 rounded-3xl bg-slate-100/80 p-2">
          {[
            { id: 'companies', label: 'Компании' },
            { id: 'roles', label: 'Роли' },
            { id: 'employees', label: 'Сотрудники' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as WorkspaceTab)}
              className={[
                'rounded-2xl px-4 py-3 text-sm font-semibold transition',
                activeTab === tab.id ? 'bg-slate-900 text-white shadow-lg shadow-slate-900/10' : 'text-slate-600 hover:bg-white',
              ].join(' ')}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {companiesQuery.isError ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">Не удалось загрузить компании.</div> : null}
      {companiesQuery.isLoading ? <div className="text-slate-500">Загрузка...</div> : null}

      {activeTab === 'companies' ? (
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-slate-950">Список компаний</h2>
              <p className="mt-1 text-sm text-slate-500">Выберите компанию, чтобы перейти к ролям или сотрудникам.</p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {companiesQuery.data?.map((company) => {
              const isSelected = company.id === selectedCompanyId
              return (
                <button
                  key={company.id}
                  type="button"
                  onClick={() => {
                    setSelectedCompanyId(company.id)
                    setRoleCompanyId(company.id)
                    setActiveTab('roles')
                  }}
                  className={[
                    'rounded-3xl border p-5 text-left shadow-xl shadow-slate-900/5 transition',
                    isSelected ? 'border-slate-900 bg-slate-950 text-white' : 'border-slate-200 bg-white hover:-translate-y-0.5 hover:shadow-2xl',
                  ].join(' ')}
                >
                  <div className={['text-xs uppercase tracking-[0.35em]', isSelected ? 'text-slate-300' : 'text-slate-400'].join(' ')}>Company</div>
                  <div className={['mt-3 text-lg font-semibold', isSelected ? 'text-white' : 'text-slate-950'].join(' ')}>{company.name}</div>
                  <div className={['mt-2 text-xs', isSelected ? 'text-slate-300' : 'text-slate-500'].join(' ')}>{company.id}</div>
                </button>
              )
            })}
          </div>
        </section>
      ) : null}

      {activeTab === 'roles' ? (
        <section className="space-y-4 rounded-[2rem] border border-white/70 bg-white/80 p-6 shadow-xl shadow-slate-900/5 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-slate-950">Роли компании</h2>
              <p className="mt-1 text-sm text-slate-500">Создание ролей и список доступных ролей для выбранной компании.</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={roleCompanyId}
                onChange={(event) => setRoleCompanyId(event.target.value)}
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
                onClick={() => setIsRoleModalOpen(true)}
                disabled={!roleCompanyId}
                className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                Создать роль
              </button>
            </div>
          </div>

          {selectedCompany ? <div className="text-sm text-slate-500">Компания: {selectedCompany.name}</div> : null}
          {rolesQuery.isLoading ? <div className="text-slate-500">Загрузка...</div> : null}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {activeCompanyRoles.map((role) => (
              <div key={role.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xl shadow-slate-900/5">
                <div className="text-xs uppercase tracking-[0.35em] text-slate-400">Role</div>
                <div className="mt-3 text-lg font-semibold text-slate-950">{role.name}</div>
                <div className="mt-1 text-sm text-slate-500">group: {role.flowable_group}</div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {activeTab === 'employees' ? (
        <section className="space-y-4 rounded-[2rem] border border-white/70 bg-white/80 p-6 shadow-xl shadow-slate-900/5 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-slate-950">Сотрудники компании</h2>
              <p className="mt-1 text-sm text-slate-500">Просмотр сотрудников выбранной компании и создание новых.</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={selectedCompanyId}
                onChange={(event) => {
                  const companyId = event.target.value
                  setSelectedCompanyId(companyId)
                  setRoleCompanyId(companyId)
                  setEmployeeRoleId('')
                }}
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
                onClick={() => setIsEmployeeModalOpen(true)}
                disabled={!selectedCompanyId}
                className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                Создать сотрудника
              </button>
            </div>
          </div>

          {selectedCompany ? <div className="text-sm text-slate-500">Компания: {selectedCompany.name}</div> : null}
          {employeesQuery.isLoading ? <div className="text-slate-500">Загрузка...</div> : null}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {employeesQuery.data?.map((employee) => (
              <div key={employee.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xl shadow-slate-900/5">
                <div className="text-xs uppercase tracking-[0.35em] text-slate-400">Employee</div>
                <div className="mt-3 text-lg font-semibold text-slate-950">{employee.name}</div>
                <div className="mt-1 text-sm text-slate-500">
                  {employee.role_name} · {employee.flowable_group}
                </div>
                <div className="mt-3 text-xs text-slate-400">user: {employee.user_id ?? '—'}</div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {isCompanyModalOpen ? (
        <Modal title="Создать компанию" onClose={() => setIsCompanyModalOpen(false)}>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault()
              createMutation.mutate({ name })
            }}
          >
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Название компании</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none"
                required
              />
            </label>

            <button type="submit" className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white">
              {createMutation.isPending ? 'Создание...' : 'Создать компанию'}
            </button>
          </form>
        </Modal>
      ) : null}

      {isRoleModalOpen ? (
        <Modal title="Создать роль" onClose={() => setIsRoleModalOpen(false)}>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault()
              if (!roleCompanyId) {
                return
              }
              createRoleMutation.mutate({ name, flowable_group: flowableGroup, company_id: roleCompanyId })
            }}
          >
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Компания</span>
              <select
                value={roleCompanyId}
                onChange={(event) => setRoleCompanyId(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                required
              >
                <option value="">Выберите компанию</option>
                {companiesQuery.data?.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Название роли</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none"
                required
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Flowable group</span>
              <input
                value={flowableGroup}
                onChange={(event) => setFlowableGroup(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                required
              />
            </label>

            <button type="submit" className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white">
              {createRoleMutation.isPending ? 'Создание...' : 'Создать роль'}
            </button>
          </form>
        </Modal>
      ) : null}

      {isEmployeeModalOpen ? (
        <Modal title="Создать сотрудника" onClose={() => setIsEmployeeModalOpen(false)}>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault()
              if (!selectedCompanyId || !employeeRoleId) {
                return
              }
              createEmployeeMutation.mutate({ name: employeeName, phone: employeePhone, company_id: selectedCompanyId, role_id: employeeRoleId })
            }}
          >
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Компания</span>
              <select
                value={selectedCompanyId}
                onChange={(event) => {
                  const companyId = event.target.value
                  setSelectedCompanyId(companyId)
                  setRoleCompanyId(companyId)
                  setEmployeeRoleId('')
                }}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                required
              >
                <option value="">Выберите компанию</option>
                {companiesQuery.data?.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Имя</span>
              <input
                value={employeeName}
                onChange={(event) => setEmployeeName(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none"
                required
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Роль</span>
              <select
                value={employeeRoleId}
                onChange={(event) => setEmployeeRoleId(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                required
              >
                <option value="">Выберите роль</option>
                {rolesQuery.data?.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name} ({role.flowable_group})
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Телефон</span>
              <input
                value={employeePhone}
                onChange={(event) => setEmployeePhone(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                required
              />
            </label>

            <button type="submit" className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white">
              {createEmployeeMutation.isPending ? 'Создание...' : 'Создать сотрудника'}
            </button>
          </form>
        </Modal>
      ) : null}
    </div>
  )
}
