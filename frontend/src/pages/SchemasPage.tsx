import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { addRole, addVariable, createSchema, deleteRole, deleteSchema, deleteVariable, getSchema, getSchemas, updateVariable } from '../api/schemas'
import { Modal } from '../components/Modal'
import { showToast } from '../lib/toast'
import type { ProcessSchemaRead, ProcessSchemaVariableRead } from '../types/api'

type VariableEditorState = {
  mode: 'create' | 'edit'
  schemaId: string
  roleId: string
  variable?: ProcessSchemaVariableRead
}

function formatReadableRoles(schema: ProcessSchemaRead, variable: ProcessSchemaVariableRead, currentRoleId: string): string {
  const roleNames = schema.roles
    .filter((role) => role.id !== currentRoleId)
    .filter((role) => variable.readable_by_roles.includes(role.role_name))
    .map((role) => role.role_name)

  return roleNames.length > 0 ? roleNames.join(', ') : '—'
}

export function SchemasPage() {
  const queryClient = useQueryClient()
  const [selectedSchemaId, setSelectedSchemaId] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [schemaName, setSchemaName] = useState('')
  const [schemaDescription, setSchemaDescription] = useState('')
  const [showRoleModal, setShowRoleModal] = useState(false)
  const [roleName, setRoleName] = useState('')
  const [roleDisplayName, setRoleDisplayName] = useState('')
  const [roleOrderIndex, setRoleOrderIndex] = useState('0')
  const [variableEditor, setVariableEditor] = useState<VariableEditorState | null>(null)
  const [variableName, setVariableName] = useState('')
  const [variableLabel, setVariableLabel] = useState('')
  const [variableType, setVariableType] = useState('string')
  const [variableRequired, setVariableRequired] = useState(true)
  const [variableReadableRoles, setVariableReadableRoles] = useState<string[]>([])
  const [variableOrderIndex, setVariableOrderIndex] = useState('0')

  const schemasQuery = useQuery({ queryKey: ['schemas'], queryFn: getSchemas })
  const schemaQuery = useQuery({
    queryKey: ['schema', selectedSchemaId],
    queryFn: () => getSchema(selectedSchemaId ?? ''),
    enabled: Boolean(selectedSchemaId),
  })

  const schemas = schemasQuery.data ?? []
  const selectedSchema = schemaQuery.data ?? null

  useEffect(() => {
    if (selectedSchemaId || schemasQuery.isLoading || schemasQuery.isFetching) {
      return
    }
    if (schemas[0]) {
      setSelectedSchemaId(schemas[0].id)
    }
  }, [schemas, schemasQuery.isFetching, schemasQuery.isLoading, selectedSchemaId])

  const refreshQueries = async () => {
    await queryClient.invalidateQueries({ queryKey: ['schemas'] })
    if (selectedSchemaId) {
      await queryClient.invalidateQueries({ queryKey: ['schema', selectedSchemaId] })
    }
  }

  const createMutation = useMutation({
    mutationFn: createSchema,
    onSuccess: async (schema) => {
      showToast('Схема создана', 'success')
      setShowCreateModal(false)
      setSchemaName('')
      setSchemaDescription('')
      setSelectedSchemaId(schema.id)
      await refreshQueries()
    },
  })

  const deleteSchemaMutation = useMutation({
    mutationFn: deleteSchema,
    onSuccess: async (_, schemaId) => {
      showToast('Схема удалена', 'success')
      if (selectedSchemaId === schemaId) {
        setSelectedSchemaId(null)
      }
      await refreshQueries()
    },
  })

  const addRoleMutation = useMutation({
    mutationFn: ({ schemaId, data }: { schemaId: string; data: { role_name: string; display_name: string; order_index?: number } }) => addRole(schemaId, data),
    onSuccess: async () => {
      showToast('Роль добавлена', 'success')
      setShowRoleModal(false)
      setRoleName('')
      setRoleDisplayName('')
      setRoleOrderIndex('0')
      await refreshQueries()
    },
  })

  const deleteRoleMutation = useMutation({
    mutationFn: deleteRole,
    onSuccess: async () => {
      showToast('Роль удалена', 'success')
      await refreshQueries()
    },
  })

  const addVariableMutation = useMutation({
    mutationFn: ({ schemaId, data }: { schemaId: string; data: Parameters<typeof addVariable>[1] }) => addVariable(schemaId, data),
    onSuccess: async () => {
      showToast('Переменная добавлена', 'success')
      setVariableEditor(null)
      setVariableName('')
      setVariableLabel('')
      setVariableType('string')
      setVariableRequired(true)
      setVariableReadableRoles([])
      setVariableOrderIndex('0')
      await refreshQueries()
    },
  })

  const updateVariableMutation = useMutation({
    mutationFn: ({ varId, data }: { varId: string; data: Parameters<typeof updateVariable>[1] }) => updateVariable(varId, data),
    onSuccess: async () => {
      showToast('Переменная обновлена', 'success')
      setVariableEditor(null)
      await refreshQueries()
    },
  })

  const deleteVariableMutation = useMutation({
    mutationFn: deleteVariable,
    onSuccess: async () => {
      showToast('Переменная удалена', 'success')
      await refreshQueries()
    },
  })

  const openAddVariableModal = (schemaId: string, roleId: string) => {
    setVariableEditor({ mode: 'create', schemaId, roleId })
    setVariableName('')
    setVariableLabel('')
    setVariableType('string')
    setVariableRequired(true)
    setVariableReadableRoles([])
    setVariableOrderIndex('0')
  }

  const openEditVariableModal = (schemaId: string, roleId: string, variable: ProcessSchemaVariableRead) => {
    setVariableEditor({ mode: 'edit', schemaId, roleId, variable })
    setVariableName(variable.name)
    setVariableLabel(variable.label)
    setVariableType(variable.type)
    setVariableRequired(variable.required)
    setVariableReadableRoles(variable.readable_by_roles)
    setVariableOrderIndex(String(variable.order_index))
  }

  const submitVariable = async () => {
    if (!variableEditor) {
      return
    }

    const payload = {
      role_id: variableEditor.roleId,
      name: variableName.trim(),
      label: variableLabel.trim(),
      type: variableType,
      required: variableRequired,
      readable_by_roles: variableReadableRoles,
      order_index: Number(variableOrderIndex) || 0,
    }

    if (!payload.label || (variableEditor.mode === 'create' && !payload.name)) {
      showToast('Заполните название и метку переменной', 'error')
      return
    }

    if (variableEditor.mode === 'create') {
      await addVariableMutation.mutateAsync({ schemaId: variableEditor.schemaId, data: payload })
      return
    }

    if (!variableEditor.variable) {
      return
    }

    await updateVariableMutation.mutateAsync({
      varId: variableEditor.variable.id,
      data: {
        label: payload.label,
        type: payload.type,
        required: payload.required,
        readable_by_roles: payload.readable_by_roles,
        order_index: payload.order_index,
      },
    })
  }

  const currentRoleNames = selectedSchema?.roles.map((role) => role.role_name) ?? []
  const selectedRoleName = selectedSchema?.roles.find((role) => role.id === variableEditor?.roleId)?.role_name ?? ''
  const visibleRoleNames = currentRoleNames.filter((roleName) => roleName !== selectedRoleName)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-slate-950">Схемы процессов</h1>
          <p className="mt-2 text-sm text-slate-500">Мета-описание ролей, переменных и видимости данных по шагам процесса.</p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-700"
        >
          Создать схему
        </button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="rounded-3xl border border-white/70 bg-white/85 p-4 shadow-xl shadow-slate-900/5 backdrop-blur">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-[0.35em] text-slate-400">Schemas</div>
              <div className="mt-1 text-lg font-semibold text-slate-950">Список схем</div>
            </div>
            {schemasQuery.isFetching ? <div className="text-xs font-medium text-slate-400">Обновление...</div> : null}
          </div>

          {schemasQuery.isLoading ? <div className="py-8 text-sm text-slate-500">Загрузка...</div> : null}

          {!schemasQuery.isLoading && schemas.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
              Пока нет схем. Создайте первую, чтобы описать роли и переменные процесса.
            </div>
          ) : null}

          <div className="space-y-3">
            {schemas.map((schema) => {
              const isSelected = schema.id === selectedSchemaId
              return (
                <div key={schema.id} className={["rounded-3xl border p-4 transition", isSelected ? 'border-blue-500 bg-blue-50 shadow-lg shadow-blue-100/60' : 'border-slate-200 bg-white hover:border-slate-300'].join(' ')}>
                  <button type="button" onClick={() => setSelectedSchemaId(schema.id)} className="block w-full text-left">
                    <div className="text-lg font-semibold text-slate-950">{schema.name}</div>
                    <div className="mt-1 text-sm text-slate-500">Ролей: {schema.roles.length}</div>
                    {schema.description ? <div className="mt-2 text-sm text-slate-600">{schema.description}</div> : null}
                  </button>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button type="button" onClick={() => setSelectedSchemaId(schema.id)} className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white">
                      Открыть
                    </button>
                    <button type="button" onClick={() => deleteSchemaMutation.mutate(schema.id)} disabled={deleteSchemaMutation.isPending} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-60">
                      Удалить
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </aside>

        <section className="rounded-3xl border border-white/70 bg-white/85 p-4 shadow-xl shadow-slate-900/5 backdrop-blur">
          {!selectedSchema ? (
            <div className="flex min-h-[560px] items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-6 text-center text-slate-500">
              Выберите схему или создайте новую.
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div>
                  <div className="text-xs uppercase tracking-[0.35em] text-slate-400">Schema</div>
                  <h2 className="mt-2 text-2xl font-semibold text-slate-950">{selectedSchema.name}</h2>
                  {selectedSchema.description ? <div className="mt-2 text-sm text-slate-500">{selectedSchema.description}</div> : null}
                </div>
                <button type="button" onClick={() => setShowRoleModal(true)} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700">
                  + Добавить роль
                </button>
              </div>

              <div className="space-y-4">
                {selectedSchema.roles.map((role) => (
                  <div key={role.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="text-xs uppercase tracking-[0.35em] text-slate-400">Роль</div>
                        <div className="mt-1 text-lg font-semibold text-slate-950">{role.role_name}</div>
                        <div className="mt-1 text-sm text-slate-500">{role.display_name}</div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => openAddVariableModal(selectedSchema.id, role.id)} className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white">
                          + Добавить переменную
                        </button>
                        <button type="button" onClick={() => deleteRoleMutation.mutate(role.id)} disabled={deleteRoleMutation.isPending} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-60">
                          Удалить роль
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 space-y-2">
                      {role.variables.length > 0 ? role.variables.map((variable) => (
                        <div key={variable.id} className="rounded-2xl bg-slate-50 px-4 py-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="font-mono text-sm font-semibold text-slate-800">{variable.name}</div>
                              <div className="mt-1 text-sm text-slate-600">{variable.label}</div>
                              <div className="mt-2 text-xs text-slate-500">Видят: {formatReadableRoles(selectedSchema, variable, role.id)}</div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full bg-slate-200 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-600">{variable.type}</span>
                              {variable.required ? <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-700">required</span> : null}
                              <button type="button" onClick={() => openEditVariableModal(selectedSchema.id, role.id, variable)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700">
                                Изменить
                              </button>
                              <button type="button" onClick={() => deleteVariableMutation.mutate(variable.id)} disabled={deleteVariableMutation.isPending} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-60">
                                Удалить
                              </button>
                            </div>
                          </div>
                        </div>
                      )) : <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">Переменных пока нет.</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>

      {showCreateModal ? (
        <Modal title="Создать схему" onClose={() => setShowCreateModal(false)}>
          <div className="space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Название</span>
              <input value={schemaName} onChange={(event) => setSchemaName(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Описание</span>
              <textarea value={schemaDescription} onChange={(event) => setSchemaDescription(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" rows={3} />
            </label>
            <button type="button" onClick={() => createMutation.mutate({ name: schemaName, description: schemaDescription || undefined })} className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white">
              {createMutation.isPending ? 'Создание...' : 'Создать'}
            </button>
          </div>
        </Modal>
      ) : null}

      {showRoleModal && selectedSchema ? (
        <Modal title="Добавить роль" onClose={() => setShowRoleModal(false)}>
          <div className="space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">role_name</span>
              <input value={roleName} onChange={(event) => setRoleName(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" placeholder="hr" />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">display_name</span>
              <input value={roleDisplayName} onChange={(event) => setRoleDisplayName(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" placeholder="HR специалист" />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">order_index</span>
              <input type="number" value={roleOrderIndex} onChange={(event) => setRoleOrderIndex(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" />
            </label>
            <button
              type="button"
              onClick={() => addRoleMutation.mutate({ schemaId: selectedSchema.id, data: { role_name: roleName, display_name: roleDisplayName, order_index: Number(roleOrderIndex) || 0 } })}
              className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white"
            >
              {addRoleMutation.isPending ? 'Добавление...' : 'Добавить'}
            </button>
          </div>
        </Modal>
      ) : null}

      {variableEditor && selectedSchema ? (
        <Modal title={variableEditor.mode === 'create' ? 'Добавить переменную' : 'Изменить переменную'} onClose={() => setVariableEditor(null)}>
          <div className="space-y-4">
            {variableEditor.mode === 'create' ? (
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">Название (camelCase)</span>
                <input value={variableName} onChange={(event) => setVariableName(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" placeholder="hrComment" />
              </label>
            ) : null}

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Метка для UI</span>
              <input value={variableLabel} onChange={(event) => setVariableLabel(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" placeholder="Комментарий HR" />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Тип</span>
              <select value={variableType} onChange={(event) => setVariableType(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <option value="string">string</option>
                <option value="integer">integer</option>
                <option value="boolean">boolean</option>
              </select>
            </label>

            <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <input type="checkbox" checked={variableRequired} onChange={(event) => setVariableRequired(event.target.checked)} />
              <span className="text-sm font-medium text-slate-700">Обязательное</span>
            </label>

            <div>
              <div className="mb-2 text-sm font-medium text-slate-700">Видно ролям</div>
              <div className="flex flex-wrap gap-2">
                {visibleRoleNames.map((roleName) => (
                  <label key={roleName} className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={variableReadableRoles.includes(roleName)}
                      onChange={(event) => {
                        setVariableReadableRoles((current) =>
                          event.target.checked ? [...current, roleName] : current.filter((value) => value !== roleName),
                        )
                      }}
                    />
                    {roleName}
                  </label>
                ))}
              </div>
            </div>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">order_index</span>
              <input type="number" value={variableOrderIndex} onChange={(event) => setVariableOrderIndex(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" />
            </label>

            <button type="button" onClick={() => void submitVariable()} className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white">
              {variableEditor.mode === 'create' ? (addVariableMutation.isPending ? 'Добавление...' : 'Добавить') : (updateVariableMutation.isPending ? 'Сохранение...' : 'Сохранить')}
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  )
}

export default SchemasPage
