import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { isAxiosError } from 'axios'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { BpmnEditor } from '../components/BpmnEditor'
import BpmnPropertiesPanel from '../components/BpmnPropertiesPanel'
import { deleteTemplateVersion, deployTemplate, getTemplateVersions, getTemplates, uploadTemplate } from '../api/templates'
import { showToast } from '../lib/toast'
import { useAuthStore } from '../store/authStore'
import { getRoles } from '../api/roles'
import type { TemplateRead, TemplateVersionRead } from '../types/api'

const VERSION_STATUS_STYLES: Record<TemplateVersionRead['status'], string> = {
  DRAFT: 'border-amber-200 bg-amber-50 text-amber-900',
  DEPLOYED: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  ARCHIVED: 'border-slate-200 bg-slate-100 text-slate-600',
}

function formatError(error: unknown, fallback: string): string {
  if (isAxiosError<{ detail?: string }>(error)) {
    const detail = error.response?.data?.detail
    if (typeof detail === 'string' && detail.trim()) {
      return detail
    }
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message
  }

  return fallback
}

function sortVersions(versions: TemplateVersionRead[]): TemplateVersionRead[] {
  return [...versions].sort((left, right) => {
    const byDate = new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
    if (byDate !== 0) {
      return byDate
    }

    return right.version - left.version
  })
}

function getPreferredVersion(versions: TemplateVersionRead[]): TemplateVersionRead | null {
  return versions.find((version) => version.status === 'DRAFT') ?? versions.find((version) => version.status === 'DEPLOYED') ?? versions[0] ?? null
}

function buildXmlFile(templateName: string, xml: string): File {
  return new File([xml], `${templateName}.bpmn20.xml`, { type: 'application/xml' })
}

function generateEmptyBpmnXml(processId: string, processName: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
             xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
             xmlns:flowable="http://flowable.org/bpmn"
             xmlns:activiti="http://activiti.org/bpmn"
             xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
             xmlns:omgdc="http://www.omg.org/spec/DD/20100524/DC"
             xmlns:omgdi="http://www.omg.org/spec/DD/20100524/DI"
             typeLanguage="http://www.w3.org/2001/XMLSchema"
             expressionLanguage="http://www.w3.org/1999/XPath"
             targetNamespace="http://www.activiti.org/test">

  <process id="${processId}" name="${processName}" isExecutable="true">
    <startEvent id="startEvent1" name="Start"/>
  </process>

  <bpmndi:BPMNDiagram id="BPMNDiagram_${processId}">
    <bpmndi:BPMNPlane id="BPMNPlane_${processId}" bpmnElement="${processId}">
      <bpmndi:BPMNShape id="startEvent1_di" bpmnElement="startEvent1">
        <omgdc:Bounds x="152" y="82" width="36" height="36"/>
        <bpmndi:BPMNLabel>
          <omgdc:Bounds x="155" y="125" width="30" height="14"/>
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>

</definitions>`
}

const PROCESS_ID_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]*$/

function downloadXml(templateName: string, xml: string): void {
  const blob = new Blob([xml], { type: 'application/xml' })
  const url = window.URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${templateName}.bpmn20.xml`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.URL.revokeObjectURL(url)
}

export function TemplatesPage() {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const committedXmlRef = useRef('')

  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null)
  const [currentXml, setCurrentXml] = useState('')
  const [isDirty, setIsDirty] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [processId, setProcessId] = useState('')
  const [processName, setProcessName] = useState('')
  const [templateName, setTemplateName] = useState('')
  const [processIdError, setProcessIdError] = useState('')
  const [templateNameTouched, setTemplateNameTouched] = useState(false)

  useEffect(() => {
    if (!templateNameTouched) {
      setTemplateName(processName)
    }
  }, [processName, templateNameTouched])

  const templatesQuery = useQuery({ queryKey: ['templates'], queryFn: getTemplates })
  const templateVersionsQuery = useQuery({
    queryKey: ['template-versions', selectedTemplateId],
    queryFn: () => getTemplateVersions(selectedTemplateId ?? ''),
    enabled: Boolean(selectedTemplateId),
  })

  const templates = templatesQuery.data ?? []
  const versions = useMemo(() => sortVersions(templateVersionsQuery.data ?? []), [templateVersionsQuery.data])

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) ?? null,
    [selectedTemplateId, templates],
  )

  const selectedVersion = useMemo(
    () => versions.find((version) => version.id === selectedVersionId) ?? null,
    [selectedVersionId, versions],
  )

  const currentDraftVersion = useMemo(() => versions.find((version) => version.status === 'DRAFT') ?? null, [versions])
  const canDeployCurrentTemplate = Boolean(currentDraftVersion)

  const applyVersion = (template: TemplateRead, version: TemplateVersionRead | null) => {
    setSelectedTemplateId(template.id)
    if (version) {
      setSelectedVersionId(version.id)
      setCurrentXml(version.xml_template)
      committedXmlRef.current = version.xml_template
      setIsDirty(false)
      return
    }

    setSelectedVersionId(null)
    setCurrentXml('')
    committedXmlRef.current = ''
    setIsDirty(false)
  }

  useEffect(() => {
    if (selectedTemplateId || templatesQuery.isLoading || templatesQuery.isFetching) {
      return
    }

    const firstTemplate = templates[0]
    if (firstTemplate) {
      setSelectedTemplateId(firstTemplate.id)
    }
  }, [selectedTemplateId, templates, templatesQuery.isFetching, templatesQuery.isLoading])

  useEffect(() => {
    if (!selectedTemplateId) {
      setSelectedVersionId(null)
      setCurrentXml('')
      committedXmlRef.current = ''
      setIsDirty(false)
      return
    }

    if (templateVersionsQuery.isLoading || templateVersionsQuery.isFetching) {
      return
    }

    if (selectedVersionId && versions.some((version) => version.id === selectedVersionId)) {
      return
    }

    const preferredVersion = getPreferredVersion(versions)
    if (preferredVersion) {
      setSelectedVersionId(preferredVersion.id)
      setCurrentXml(preferredVersion.xml_template)
      committedXmlRef.current = preferredVersion.xml_template
      setIsDirty(false)
      return
    }

    setSelectedVersionId(null)
    setCurrentXml('')
    committedXmlRef.current = ''
    setIsDirty(false)
  }, [selectedTemplateId, selectedVersionId, templateVersionsQuery.isFetching, templateVersionsQuery.isLoading, versions])

  const refreshTemplateQueries = async () => {
    await queryClient.invalidateQueries({ queryKey: ['templates'] })
    await queryClient.invalidateQueries({ queryKey: ['template-versions'] })
  }

  const uploadMutation = useMutation({
    mutationFn: async ({ file, templateName }: { file: File; templateName?: string }) => uploadTemplate(file, templateName),
    onSuccess: async (template) => {
      const preferredVersion = getPreferredVersion(sortVersions(template.versions))
      if (preferredVersion) {
        applyVersion(template, preferredVersion)
      } else {
        applyVersion(template, null)
      }

      await refreshTemplateQueries()
      showToast('Шаблон загружен', 'success')
    },
    onError: (error) => {
      showToast(formatError(error, 'Не удалось загрузить шаблон'), 'error')
    },
  })

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTemplate) {
        throw new Error('Шаблон не выбран')
      }

      return uploadTemplate(buildXmlFile(selectedTemplate.name, currentXml), selectedTemplate.name)
    },
    onSuccess: async (template) => {
      // Инвалидируем и ждём обновления
      await queryClient.invalidateQueries({ queryKey: ['templates'] })
      await queryClient.invalidateQueries({ queryKey: ['template-versions', selectedTemplateId] })

      // Получаем свежий список версий
      if (selectedTemplateId) {
        const versionsData = await queryClient.fetchQuery({
          queryKey: ['template-versions', selectedTemplateId],
          queryFn: () => getTemplateVersions(selectedTemplateId),
        })

        // Ищем последний DRAFT (только что созданный)
        const newDraft = sortVersions(versionsData).find((v) => v.status === 'DRAFT')

        if (newDraft) {
          setSelectedVersionId(newDraft.id)
          setCurrentXml(newDraft.xml_template)
          committedXmlRef.current = newDraft.xml_template
          setIsDirty(false)
        }
      }

      showToast('Сохранено как Draft', 'success')
    },
    onError: (error) => {
      showToast(formatError(error, 'Не удалось сохранить шаблон'), 'error')
    },
  })

  const deployMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTemplate) {
        throw new Error('Шаблон не выбран')
      }

      return deployTemplate(selectedTemplate.id)
    },
    onSuccess: async (result) => {
      applyVersion(result.template, result.version)
      await refreshTemplateQueries()
      showToast('Задеплоено успешно', 'success')
    },
    onError: (error) => {
      showToast(formatError(error, 'Не удалось задеплоить шаблон'), 'error')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteTemplateVersion,
    onSuccess: async () => {
      await refreshTemplateQueries()
      showToast('Версия удалена', 'success')
    },
    onError: (error) => {
      showToast(formatError(error, 'Не удалось удалить версию'), 'error')
    },
  })

  const handleFileInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file) {
      return
    }

    await uploadMutation.mutateAsync({ file })
  }

  const closeCreateModal = () => {
    setShowCreateModal(false)
    setProcessId('')
    setProcessName('')
    setTemplateName('')
    setProcessIdError('')
    setTemplateNameTouched(false)
  }

  const handleOpenCreateModal = () => {
    setShowCreateModal(true)
    setProcessId('')
    setProcessName('')
    setTemplateName('')
    setProcessIdError('')
    setTemplateNameTouched(false)
  }

  const handleTemplateNameChange = (value: string) => {
    setTemplateNameTouched(true)
    setTemplateName(value)
  }

  const handleCreateNew = async () => {
    const normalizedProcessId = processId.trim()
    const normalizedProcessName = processName.trim()
    const normalizedTemplateName = templateName.trim() || normalizedProcessName

    if (!normalizedProcessId) {
      setProcessIdError('Process ID обязателен')
      return
    }

    if (!PROCESS_ID_PATTERN.test(normalizedProcessId)) {
      setProcessIdError('Только латиница, цифры, дефис и underscore. Первый символ должен быть буквой.')
      return
    }

    if (!normalizedProcessName) {
      return
    }

    const xml = generateEmptyBpmnXml(normalizedProcessId, normalizedProcessName)
    const file = new File([xml], `${normalizedProcessId}.bpmn20.xml`, { type: 'application/xml' })

    await uploadMutation.mutateAsync({ file, templateName: normalizedTemplateName })
    closeCreateModal()
  }

  const handleSelectTemplate = (template: TemplateRead) => {
    setSelectedTemplateId(template.id)
    setSelectedVersionId(null)
    setCurrentXml('')
    committedXmlRef.current = ''
    setIsDirty(false)
  }

  const handleSelectVersion = (version: TemplateVersionRead) => {
    console.log('Loading version XML:', {
      id: version.id,
      status: version.status,
      xmlLength: version.xml_template?.length,
      xmlPreview: version.xml_template?.substring(0, 100),
    })
    setSelectedVersionId(version.id)
    setCurrentXml(version.xml_template)
    committedXmlRef.current = version.xml_template
    setIsDirty(false)
  }

  const handleEditorChange = (xml: string) => {
    setCurrentXml(xml)
    setIsDirty(xml !== committedXmlRef.current)
  }

  const handleSave = async () => {
    if (!selectedTemplate || !currentXml.trim()) {
      return
    }

    await saveMutation.mutateAsync()
  }

  const handleDeploy = async () => {
    if (!selectedTemplate) {
      return
    }

    const confirmed = window.confirm('Задеплоить текущий Draft в Flowable?')
    if (!confirmed) {
      return
    }

    await deployMutation.mutateAsync()
  }

  const handleDeleteVersion = async (version: TemplateVersionRead) => {
    const confirmed = window.confirm('Удалить эту версию?')
    if (!confirmed) {
      return
    }

    const deletingSelected = version.id === selectedVersionId
    await deleteMutation.mutateAsync(version.id)

    if (deletingSelected) {
      setSelectedVersionId(null)
    }
  }

  const handleDownload = () => {
    if (!selectedTemplate || !currentXml.trim()) {
      return
    }

    downloadXml(selectedTemplate.name, currentXml)
  }

  const editorReadonly = selectedVersion?.status === 'DEPLOYED' || selectedVersion?.status === 'ARCHIVED'
  const createTemplateDisabled =
    uploadMutation.isPending || !processId.trim() || !processName.trim() || !PROCESS_ID_PATTERN.test(processId.trim())

  const modelerRef = useRef<any | null>(null)
  const [selectedElement, setSelectedElement] = useState<any | null>(null)

  const authUser = useAuthStore((s) => s.user)
  const companyId = authUser?.company_id ?? ''
  const rolesQuery = useQuery({
    queryKey: ['roles', companyId],
    queryFn: () => getRoles(companyId),
    enabled: Boolean(companyId),
  })

  const availableRoles = (rolesQuery.data ?? []).map((r: any) => r.flowable_group)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-slate-950">Редактор шаблонов</h1>
          <p className="mt-2 text-sm text-slate-500">Загрузка, редактирование и деплой BPMN-шаблонов.</p>
        </div>

        <div className="flex items-center gap-3">
          <input ref={fileInputRef} type="file" accept=".bpmn,.xml,application/xml,text/xml" className="hidden" onChange={handleFileInputChange} />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadMutation.isPending}
            className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {uploadMutation.isPending ? 'Загрузка...' : 'Загрузить файл'}
          </button>
          <button
            type="button"
            onClick={handleOpenCreateModal}
            disabled={uploadMutation.isPending}
            className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            + Создать новый
          </button>
        </div>
      </div>

      {showCreateModal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-8 backdrop-blur-sm"
          onClick={closeCreateModal}
          role="presentation"
        >
          <div
            className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl shadow-slate-950/20"
            onClick={(event) => event.stopPropagation()}
            role="presentation"
          >
            <div className="mb-5 flex items-center justify-between gap-4">
              <h2 className="text-xl font-semibold text-slate-900">Новый шаблон</h2>
              <button
                type="button"
                onClick={closeCreateModal}
                className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-200"
              >
                Закрыть
              </button>
            </div>

            <div className="space-y-5">
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-800">Process ID *</label>
                <input
                  type="text"
                  value={processId}
                  onChange={(event) => {
                    const value = event.target.value
                    setProcessId(value)
                    if (value.trim() && PROCESS_ID_PATTERN.test(value.trim())) {
                      setProcessIdError('')
                    } else if (processIdError) {
                      setProcessIdError('')
                    }
                  }}
                  placeholder="simpleApproval"
                  className={[
                    'w-full rounded-2xl border px-4 py-3 text-sm outline-none transition focus:ring-4',
                    processIdError ? 'border-red-300 bg-red-50 focus:border-red-500 focus:ring-red-100' : 'border-slate-200 bg-white focus:border-blue-500 focus:ring-blue-100',
                  ].join(' ')}
                />
                <div className="mt-2 text-xs text-slate-500">Используется в BPMN как id процесса</div>
                {processIdError ? <div className="mt-2 text-sm font-medium text-red-600">{processIdError}</div> : null}
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-800">Process Name *</label>
                <input
                  type="text"
                  value={processName}
                  onChange={(event) => setProcessName(event.target.value)}
                  placeholder="Simple Approval"
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                />
                <div className="mt-2 text-xs text-slate-500">Отображаемое название процесса</div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-800">Template Name (для списка)</label>
                <input
                  type="text"
                  value={templateName}
                  onChange={(event) => handleTemplateNameChange(event.target.value)}
                  placeholder="Simple Approval"
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                />
                <div className="mt-2 text-xs text-slate-500">Название шаблона в системе</div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeCreateModal}
                  className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={handleCreateNew}
                  disabled={createTemplateDisabled}
                  className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {uploadMutation.isPending ? 'Создание...' : 'Создать'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)_288px]">
        <aside className="rounded-3xl border border-white/70 bg-white/85 p-4 shadow-xl shadow-slate-900/5 backdrop-blur">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-[0.35em] text-slate-400">Templates</div>
              <div className="mt-1 text-lg font-semibold text-slate-950">Список шаблонов</div>
            </div>
            {templatesQuery.isFetching ? <div className="text-xs font-medium text-slate-400">Обновление...</div> : null}
          </div>

          {templatesQuery.isLoading ? <div className="py-8 text-sm text-slate-500">Загрузка...</div> : null}

          {!templatesQuery.isLoading && templates.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
              Пока нет шаблонов. Загрузите BPMN-файл, чтобы начать работу.
            </div>
          ) : null}

          <div className="space-y-3">
            {templates.map((template) => {
              const isSelected = template.id === selectedTemplateId
              return (
                <div key={template.id} className={["rounded-3xl border p-4 transition", isSelected ? 'border-blue-500 bg-blue-50 shadow-lg shadow-blue-100/60' : 'border-slate-200 bg-white hover:border-slate-300'].join(' ')}>
                  <button
                    type="button"
                    onClick={() => handleSelectTemplate(template)}
                    className="block w-full text-left"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-lg font-semibold text-slate-950">{template.name}</div>
                        <div className="mt-1 text-xs uppercase tracking-[0.3em] text-slate-400">{template.process_definition_key}</div>
                      </div>
                      <span className={["rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em]", template.status === 'DEPLOYED' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'].join(' ')}>
                        {template.status}
                      </span>
                    </div>
                  </button>

                  {isSelected ? (
                    <div className="mt-4 space-y-2 border-t border-slate-200 pt-4">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold text-slate-800">Версии</div>
                        {templateVersionsQuery.isFetching ? <div className="text-xs text-slate-400">Загрузка...</div> : null}
                      </div>

                      {templateVersionsQuery.isLoading ? <div className="py-4 text-sm text-slate-500">Загрузка версий...</div> : null}

                      {!templateVersionsQuery.isLoading && versions.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">У шаблона пока нет версий.</div>
                      ) : null}

                      <div className="space-y-2">
                        {versions.map((version) => {
                          const isActive = version.id === selectedVersionId
                          const canDelete = version.status !== 'DEPLOYED'
                          return (
                            <div key={version.id} className={["rounded-2xl border p-3", isActive ? 'border-blue-500 bg-white shadow-sm' : 'border-slate-200 bg-slate-50'].join(' ')}>
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className={["rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.22em]", VERSION_STATUS_STYLES[version.status]].join(' ')}>
                                      {version.status}
                                    </span>
                                    {version.flowable_version ? <span className="text-xs font-semibold text-slate-500">#{version.flowable_version}</span> : null}
                                    <span className="text-xs text-slate-400">v{version.version}</span>
                                  </div>
                                  <div className="mt-2 text-sm text-slate-700">{new Date(version.created_at).toLocaleString()}</div>
                                </div>
                                {isActive ? <div className="rounded-full bg-blue-100 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-blue-700">Active</div> : null}
                              </div>

                              <div className="mt-3 flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleSelectVersion(version)}
                                  className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-700"
                                >
                                  Редактировать
                                </button>
                                {canDelete ? (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteVersion(version)}
                                    disabled={deleteMutation.isPending}
                                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-rose-300 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    {deleteMutation.isPending ? 'Удаление...' : 'Удалить'}
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        </aside>

        <section className="flex min-h-0 flex-col gap-4 rounded-3xl border border-white/70 bg-white/85 p-4 shadow-xl shadow-slate-900/5 backdrop-blur">
          {!selectedTemplate ? (
            <div className="flex min-h-[calc(100vh-200px)] items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-6 text-center text-slate-500">
              Выберите шаблон для редактирования.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div>
                  <div className="text-xs uppercase tracking-[0.35em] text-slate-400">Editor</div>
                  <h2 className="mt-2 text-2xl font-semibold text-slate-950">{selectedTemplate.name}</h2>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-500">
                    <span>{selectedTemplate.process_definition_key}</span>
                    <span>·</span>
                    <span className={["rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.22em]", selectedVersion?.status === 'DEPLOYED' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'].join(' ')}>
                      {selectedVersion?.status ?? '—'}
                    </span>
                    {isDirty ? <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-amber-700">Несохранённые изменения</span> : null}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saveMutation.isPending || !currentXml.trim()}
                    className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saveMutation.isPending ? 'Сохранение...' : 'Сохранить'}
                  </button>

                  {canDeployCurrentTemplate ? (
                    <button
                      type="button"
                      onClick={handleDeploy}
                      disabled={deployMutation.isPending}
                      className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 transition hover:border-emerald-300 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {deployMutation.isPending ? 'Деплой...' : 'Задеплоить'}
                    </button>
                  ) : null}

                  <button
                    type="button"
                    onClick={handleDownload}
                    disabled={!currentXml.trim()}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Скачать XML
                  </button>
                </div>
              </div>

              {editorReadonly ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
                  Это задеплоенная версия. Нажмите Сохранить, чтобы создать новый Draft для редактирования.
                </div>
              ) : null}

              <div className="min-h-[calc(100vh-200px)] flex-1 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                {templateVersionsQuery.isLoading && versions.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-sm text-slate-500">Загрузка редактора...</div>
                ) : currentXml && currentXml.includes('bpmn') ? (
                  <BpmnEditor
                    key={selectedVersionId}
                    xml={currentXml}
                    onChange={handleEditorChange}
                    readonly={editorReadonly}
                    onModelerReady={(m) => { modelerRef.current = m }}
                    onElementSelect={setSelectedElement}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-slate-500">Загрузка диаграммы...</div>
                )}
              </div>
              {/* Properties panel column */}
              {!editorReadonly && selectedElement ? (
                <div className="w-full border-l border-slate-200 bg-white">
                  <BpmnPropertiesPanel
                    element={selectedElement}
                    availableRoles={availableRoles}
                    modeler={modelerRef.current}
                    onXmlChange={(xml) => { handleEditorChange(xml) }}
                  />
                </div>
              ) : (
                <div className="w-full" />
              )}
            </>
          )}
        </section>
      </div>
    </div>
  )
}