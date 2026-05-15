import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { createEmployee, getEmployees } from '../api/employees'
import { getCompanies } from '../api/companies'
import { getRoles } from '../api/roles'
import { Modal } from '../components/Modal'
import { useAuth } from '../hooks/useAuth'
import { showToast } from '../lib/toast'

export function EmployeesPage() {
  const queryClient = useQueryClient()
  const user = useAuth((state) => state.user)
  const [companyId, setCompanyId] = useState<string>('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [createdTempPassword, setCreatedTempPassword] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [roleId, setRoleId] = useState('')

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

  const employeesQuery = useQuery({
    queryKey: ['employees', companyId],
    queryFn: () => getEmployees(companyId),
    enabled: Boolean(companyId),
  })

  const createMutation = useMutation({
    mutationFn: createEmployee,
    onSuccess: async (employee) => {
      showToast('Сотрудник создан')
      setCreatedTempPassword(employee.temp_password ?? null)
      setIsModalOpen(false)
      setName('')
      setRoleId('')
      await queryClient.invalidateQueries({ queryKey: ['employees', companyId] })
    },
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-slate-950">Сотрудники</h1>
          <p className="mt-2 text-sm text-slate-500">Создавайте сотрудников и выдавайте им временные учётные данные.</p>
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
          <button type="button" onClick={() => setIsModalOpen(true)} disabled={!companyId} className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">
            Создать сотрудника
          </button>
        </div>
      </div>

      {employeesQuery.isLoading ? <div className="text-slate-500">Загрузка...</div> : null}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {employeesQuery.data?.map((employee) => (
          <div key={employee.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xl shadow-slate-900/5">
            <div className="text-xs uppercase tracking-[0.35em] text-slate-400">Employee</div>
            <div className="mt-3 text-lg font-semibold text-slate-950">{employee.name}</div>
            <div className="mt-1 text-sm text-slate-500">{employee.role_name} · {employee.flowable_group}</div>
            <div className="mt-3 text-xs text-slate-400">user: {employee.user_id ?? '—'}</div>
          </div>
        ))}
      </div>

      {isModalOpen ? (
        <Modal title="Создать сотрудника" onClose={() => setIsModalOpen(false)}>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault()
              if (!companyId || !roleId) {
                return
              }
              createMutation.mutate({ name, phone, company_id: companyId, role_id: roleId })
            }}
          >
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Имя</span>
              <input value={name} onChange={(event) => setName(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" required />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Роль</span>
              <select value={roleId} onChange={(event) => setRoleId(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" required>
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
              <input value={phone} onChange={(event) => setPhone(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" required />
            </label>
            <button type="submit" className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white">
              {createMutation.isPending ? 'Создание...' : 'Создать'}
            </button>
          </form>
        </Modal>
      ) : null}

      {createdTempPassword ? (
        <Modal title="Временный пароль" onClose={() => setCreatedTempPassword(null)}>
          <div className="space-y-4">
            <p className="text-sm text-slate-600">Пароль показывается только один раз.</p>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 font-mono text-sm text-amber-900">{createdTempPassword}</div>
          </div>
        </Modal>
      ) : null}
    </div>
  )
}
