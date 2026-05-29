import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { isAxiosError } from 'axios'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { BpmnEditor } from '../components/BpmnEditor'
import { MigrationModal } from '../components/MigrationModal'
import BpmnPropertiesPanel from '../components/BpmnPropertiesPanel'
import {
  deleteTemplateVersion,
  deployTemplate,
  getActiveInstances,
  getTemplateVersions,
  getTemplates,
  linkSchemaToTemplate,
  uploadTemplate,
} from '../api/templates'
import { showToast } from '../lib/toast'
import { useAuthStore } from '../store/authStore'
import { getRoles } from '../api/roles'
import { getSchema, getSchemas } from '../api/schemas'
import type { ActiveProcessInstance, TemplateRead, TemplateVersionRead } from '../types/api'

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

function escapeXmlAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function generateEmptyBpmnXml(
  processId: string,
  processName: string,
  options?: {
    addMessageLink?: boolean
    messageName?: string
    secondProcessId?: string
    secondProcessName?: string
  },
): string {
  const addMessageLink = options?.addMessageLink ?? false
  const messageName = options?.messageName?.trim() || `Start${processId}`
  const secondProcessId = options?.secondProcessId?.trim() || `${processId}Handler`
  const secondProcessName = options?.secondProcessName?.trim() || `${processName} Handler`

  if (!addMessageLink) {
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

  const messageId = messageName
  const messagePrefixedName = messageName

  return `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
             xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
             xmlns:flowable="http://flowable.org/bpmn"
             xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
             xmlns:omgdc="http://www.omg.org/spec/DD/20100524/DC"
             xmlns:omgdi="http://www.omg.org/spec/DD/20100524/DI"
             targetNamespace="http://www.activiti.org/test">

  <message id="${escapeXmlAttr(messageId)}" name="${escapeXmlAttr(messagePrefixedName)}"/>

  <process id="${escapeXmlAttr(processId)}" name="${escapeXmlAttr(processName)}" isExecutable="true">
    <startEvent id="${escapeXmlAttr(processId)}_start" name="Start">
      <outgoing>${escapeXmlAttr(processId)}_flow1</outgoing>
    </startEvent>
    <sequenceFlow id="${escapeXmlAttr(processId)}_flow1"
                  sourceRef="${escapeXmlAttr(processId)}_start"
                  targetRef="${escapeXmlAttr(processId)}_msgEnd"/>
    <endEvent id="${escapeXmlAttr(processId)}_msgEnd" name="${escapeXmlAttr(messageName)}">
      <incoming>${escapeXmlAttr(processId)}_flow1</incoming>
      <messageEventDefinition id="${escapeXmlAttr(processId)}_msgDef"
              messageRef="${escapeXmlAttr(messageId)}"/>
    </endEvent>
  </process>

  <process id="${escapeXmlAttr(secondProcessId)}" name="${escapeXmlAttr(secondProcessName)}" isExecutable="true">
    <startEvent id="${escapeXmlAttr(secondProcessId)}_start" name="${escapeXmlAttr(messageName)}">
      <outgoing>${escapeXmlAttr(secondProcessId)}_flow1</outgoing>
      <messageEventDefinition id="${escapeXmlAttr(secondProcessId)}_msgDef"
              messageRef="${escapeXmlAttr(messageId)}"/>
    </startEvent>
    <sequenceFlow id="${escapeXmlAttr(secondProcessId)}_flow1"
                  sourceRef="${escapeXmlAttr(secondProcessId)}_start"
                  targetRef="${escapeXmlAttr(secondProcessId)}_end"/>
    <endEvent id="${escapeXmlAttr(secondProcessId)}_end" name="End">
      <incoming>${escapeXmlAttr(secondProcessId)}_flow1</incoming>
    </endEvent>
  </process>

  <bpmndi:BPMNDiagram id="BPMNDiagram_${escapeXmlAttr(processId)}">
    <bpmndi:BPMNPlane id="BPMNPlane_${escapeXmlAttr(processId)}" bpmnElement="${escapeXmlAttr(processId)}">
      <bpmndi:BPMNShape id="${escapeXmlAttr(processId)}_start_di" bpmnElement="${escapeXmlAttr(processId)}_start">
        <omgdc:Bounds x="152" y="82" width="36" height="36"/>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="${escapeXmlAttr(processId)}_msgEnd_di" bpmnElement="${escapeXmlAttr(processId)}_msgEnd">
        <omgdc:Bounds x="352" y="82" width="36" height="36"/>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="${escapeXmlAttr(processId)}_flow1_di" bpmnElement="${escapeXmlAttr(processId)}_flow1">
        <omgdi:waypoint x="188" y="100"/>
        <omgdi:waypoint x="352" y="100"/>
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNShape id="${escapeXmlAttr(secondProcessId)}_start_di" bpmnElement="${escapeXmlAttr(secondProcessId)}_start">
        <omgdc:Bounds x="152" y="242" width="36" height="36"/>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="${escapeXmlAttr(secondProcessId)}_end_di" bpmnElement="${escapeXmlAttr(secondProcessId)}_end">
        <omgdc:Bounds x="352" y="242" width="36" height="36"/>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="${escapeXmlAttr(secondProcessId)}_flow1_di" bpmnElement="${escapeXmlAttr(secondProcessId)}_flow1">
        <omgdi:waypoint x="188" y="260"/>
        <omgdi:waypoint x="352" y="260"/>
      </bpmndi:BPMNEdge>
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
  const [addMessageLink, setAddMessageLink] = useState(false)
  const [messageName, setMessageName] = useState('')
  const [secondProcessId, setSecondProcessId] = useState('')
  const [secondProcessName, setSecondProcessName] = useState('')
  const [migrationModalData, setMigrationModalData] = useState<{
    templateId: string
    templateName: string
    targetVersionId: string
    activeInstances: ActiveProcessInstance[]
  } | null>(null)

  useEffect(() => {
    if (!templateNameTouched) {
      setTemplateName(processName)
    }
  }, [processName, templateNameTouched])

  useEffect(() => {
    if (addMessageLink && processId) {
      const capitalizedProcessId = processId.charAt(0).toUpperCase() + processId.slice(1)
      setMessageName(`Start${capitalizedProcessId}`)
      setSecondProcessId(`${processId}Handler`)
      setSecondProcessName(`${processName} Handler`)
    }
  }, [addMessageLink, processId, processName])

  const templatesQuery = useQuery({ queryKey: ['templates'], queryFn: getTemplates })
  const schemasQuery = useQuery({ queryKey: ['schemas'], queryFn: getSchemas })
  const templateVersionsQuery = useQuery({
    queryKey: ['template-versions', selectedTemplateId],
    queryFn: () => getTemplateVersions(selectedTemplateId ?? ''),
    enabled: Boolean(selectedTemplateId),
  })

  const templates = templatesQuery.data ?? []
  const deployedTemplates = useMemo(
    () =>
      templates
        .filter((template) => template.status === 'DEPLOYED')
        .map((template) => ({ key: template.process_definition_key, name: template.name })),
    [templates],
  )
  const versions = useMemo(() => sortVersions(templateVersionsQuery.data ?? []), [templateVersionsQuery.data])

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) ?? null,
    [selectedTemplateId, templates],
  )

  const schemaQuery = useQuery({
    queryKey: ['schema', selectedTemplate?.schema_id],
    queryFn: () => getSchema(selectedTemplate!.schema_id!),
    enabled: Boolean(selectedTemplate?.schema_id),
  })

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

  const linkSchemaMutation = useMutation({
    mutationFn: async (schemaId: string | null) => {
      if (!selectedTemplate) {
        throw new Error('Шаблон не выбран')
      }

      return linkSchemaToTemplate(selectedTemplate.id, schemaId)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['templates'] })
      await queryClient.invalidateQueries({ queryKey: ['template-versions', selectedTemplateId] })
      showToast('Схема привязана', 'success')
    },
    onError: (error) => {
      showToast(formatError(error, 'Не удалось привязать схему'), 'error')
    },
  })

  const handleDeployWithMigrationClick = async () => {
    if (!selectedTemplate || !currentDraftVersion) {
      return
    }

    try {
      const response = await getActiveInstances(selectedTemplate.id)
      setMigrationModalData({
        templateId: selectedTemplate.id,
        templateName: selectedTemplate.name,
        targetVersionId: currentDraftVersion.id,
        activeInstances: response.items,
      })
    } catch {
      showToast('Не удалось загрузить активные процессы', 'error')
    }
  }

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
    setAddMessageLink(false)
    setMessageName('')
    setSecondProcessId('')
    setSecondProcessName('')
  }

  const handleOpenCreateModal = () => {
    setShowCreateModal(true)
    setProcessId('')
    setProcessName('')
    setTemplateName('')
    setProcessIdError('')
    setTemplateNameTouched(false)
    setAddMessageLink(false)
    setMessageName('')
    setSecondProcessId('')
    setSecondProcessName('')
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

    const xml = generateEmptyBpmnXml(
      normalizedProcessId,
      normalizedProcessName,
      addMessageLink
        ? {
            addMessageLink: true,
            messageName: messageName.trim() || `Start${normalizedProcessId}`,
            secondProcessId: secondProcessId.trim() || `${normalizedProcessId}Handler`,
            secondProcessName: secondProcessName.trim() || `${normalizedProcessName} Handler`,
          }
        : undefined,
    )
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

    const validateXmlBeforeDeploy = (xml: string): string[] => {
      const warnings: string[] = []

      const emptyMsgDef = /<messageEventDefinition[^>]*(?!\smessageRef)[^>]*\/>/g
      if (emptyMsgDef.test(xml)) {
        warnings.push('Есть Message события без messageRef — Flowable не сможет их связать')
      }

      const messageRefs = [...xml.matchAll(/messageRef="([^"]+)"/g)].map((match) => match[1])
      const declaredMessages = [...xml.matchAll(/<message[^>]+id="([^"]+)"/g)].map((match) => match[1])
      messageRefs.forEach((ref) => {
        if (!declaredMessages.includes(ref)) {
          warnings.push(`messageRef="${ref}" не объявлен в <definitions>`)
        }
      })

      return warnings
    }

    const warnings = validateXmlBeforeDeploy(currentXml)
    if (warnings.length > 0) {
      const proceed = window.confirm(`Предупреждения перед деплоем:\n\n${warnings.join('\n')}\n\nПродолжить?`)
      if (!proceed) {
        return
      }
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
  const lastSelectedElementRef = useRef<any | null>(null)

  const handleElementSelect = (el: any | null) => {
    if (el) {
      lastSelectedElementRef.current = el
      setSelectedElement(el)
      return
    }

    setSelectedElement(lastSelectedElementRef.current)
  }

  const authUser = useAuthStore((s) => s.user)
  const companyId = authUser?.company_id ?? ''
  const rolesQuery = useQuery({
    queryKey: ['roles', companyId],
    queryFn: () => getRoles(companyId),
    enabled: Boolean(companyId),
  })

  const availableRoles = (rolesQuery.data ?? []).map((r: any) => r.flowable_group)

  const showPropertiesPanel = !editorReadonly && Boolean(selectedElement)

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-4">
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

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <label className="flex cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    checked={addMessageLink}
                    onChange={(event) => setAddMessageLink(event.target.checked)}
                    className="h-4 w-4 rounded"
                  />
                  <div>
                    <div className="text-sm font-semibold text-slate-800">Связать с другим процессом через сообщение</div>
                    <div className="text-xs text-slate-500">Создаст MessageEndEvent → MessageStartEvent между двумя процессами</div>
                  </div>
                </label>

                {addMessageLink ? (
                  <div className="mt-4 space-y-3 border-t border-slate-200 pt-4">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-700">Имя сообщения (messageRef)</label>
                      <input
                        value={messageName}
                        onChange={(event) => setMessageName(event.target.value)}
                        placeholder="StartSecond"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                      />
                      <div className="mt-1 text-xs text-slate-400">
                        В XML: <span className="font-mono">{`<message id="${messageName}" name="${messageName}"/>`}</span>
                      </div>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-700">ID второго процесса (получатель)</label>
                      <input
                        value={secondProcessId}
                        onChange={(event) => setSecondProcessId(event.target.value)}
                        placeholder="secondProcess"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-700">Название второго процесса</label>
                      <input
                        value={secondProcessName}
                        onChange={(event) => setSecondProcessName(event.target.value)}
                        placeholder="Second Process"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                      />
                    </div>

                    <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs font-mono text-blue-800 space-y-1">
                      <div>{`[${processName}] --${messageName}--> [${secondProcessName}]`}</div>
                      <div className="text-blue-500">MessageEndEvent → MessageStartEvent</div>
                    </div>
                  </div>
                ) : null}
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

      <div className="flex min-h-0 flex-1 gap-6">
        <aside className="flex w-80 shrink-0 flex-col overflow-hidden rounded-3xl border border-white/70 bg-white/85 shadow-xl shadow-slate-900/5 backdrop-blur">
          <div className="shrink-0 p-4 pb-0">
            <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-[0.35em] text-slate-400">Templates</div>
              <div className="mt-1 text-lg font-semibold text-slate-950">Список шаблонов</div>
            </div>
            {templatesQuery.isFetching ? <div className="text-xs font-medium text-slate-400">Обновление...</div> : null}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 pt-0">
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
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col gap-3 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-900/5">
          {!selectedTemplate ? (
            <div className="flex min-h-[calc(100vh-200px)] items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-6 text-center text-slate-500">
              Выберите шаблон для редактирования.
            </div>
          ) : (
            <>
              <div className="shrink-0 rounded-t-3xl border-b border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="text-xs uppercase tracking-[0.35em] text-slate-400">Editor</div>
                    <h2 className="mt-2 text-2xl font-semibold text-slate-950">{selectedTemplate.name}</h2>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-500">
                      <span>{selectedTemplate.process_definition_key}</span>
                      <span>·</span>
                      <span className={['rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.22em]', selectedVersion?.status === 'DEPLOYED' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'].join(' ')}>
                        {selectedVersion?.status ?? '—'}
                      </span>
                      {isDirty ? <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-amber-700">Несохранённые изменения</span> : null}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2">
                      <span className="text-sm text-slate-500">Схема:</span>
                      <select
                        value={selectedTemplate.schema_id ?? ''}
                        onChange={(event) => void linkSchemaMutation.mutateAsync(event.target.value || null)}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                        disabled={linkSchemaMutation.isPending || schemasQuery.isLoading}
                      >
                        <option value="">— без схемы —</option>
                        {schemasQuery.data?.map((schema) => (
                          <option key={schema.id} value={schema.id}>{schema.name}</option>
                        ))}
                      </select>
                    </div>

                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={saveMutation.isPending || !currentXml.trim()}
                      className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {saveMutation.isPending ? 'Сохранение...' : 'Сохранить'}
                    </button>

                    {canDeployCurrentTemplate ? (
                      <>
                        <button
                          type="button"
                          onClick={handleDeploy}
                          disabled={deployMutation.isPending}
                          className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 transition hover:border-emerald-300 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {deployMutation.isPending ? 'Деплой...' : 'Задеплоить'}
                        </button>

                        <button
                          type="button"
                          onClick={handleDeployWithMigrationClick}
                          disabled={deployMutation.isPending}
                          className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-800 transition hover:border-blue-300 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {deployMutation.isPending ? 'Деплой...' : 'Задеплоить + мигрировать'}
                        </button>
                      </>
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
              </div>

              {editorReadonly ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
                  Это задеплоенная версия. Нажмите Сохранить, чтобы создать новый Draft для редактирования.
                </div>
              ) : null}

              <div className="relative min-h-0 flex-1">
                {templateVersionsQuery.isLoading && versions.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-sm text-slate-500">Загрузка редактора...</div>
                ) : currentXml && currentXml.includes('bpmn') ? (
                  <BpmnEditor
                    key={selectedVersionId}
                    xml={currentXml}
                    onChange={handleEditorChange}
                    readonly={editorReadonly}
                    onModelerReady={(m) => { modelerRef.current = m }}
                    onElementSelect={handleElementSelect}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-slate-500">Загрузка диаграммы...</div>
                )}
              </div>
            </>
          )}
        </section>

        {showPropertiesPanel ? (
          <aside className="flex w-72 shrink-0 flex-col overflow-hidden rounded-3xl border border-white/70 bg-white/85 shadow-xl shadow-slate-900/5 backdrop-blur" style={{ position: 'relative', zIndex: 10 }}>
            <div className="sticky top-0 border-b border-slate-100 bg-white/90 px-4 py-3 backdrop-blur">
              <div className="text-xs font-semibold uppercase tracking-widest text-slate-400">Properties</div>
            </div>
            <div className="flex-1 overflow-y-auto">
              <BpmnPropertiesPanel
                element={selectedElement}
                availableRoles={availableRoles}
                modeler={modelerRef.current}
                onXmlChange={handleEditorChange}
                schema={schemaQuery.data ?? null}
                availableProcessKeys={deployedTemplates}
              />
            </div>
          </aside>
        ) : null}
      </div>

      <MigrationModal
        open={migrationModalData !== null}
        templateId={migrationModalData?.templateId ?? null}
        templateName={migrationModalData?.templateName ?? null}
        targetVersionId={migrationModalData?.targetVersionId ?? null}
        activeInstances={migrationModalData?.activeInstances ?? []}
        onDeploy={async () => {
          if (!selectedTemplate) {
            throw new Error('Шаблон не выбран')
          }

          const result = await deployTemplate(selectedTemplate.id)
          await refreshTemplateQueries()
          return result.version.process_definition_id!
        }}
        onClose={() => setMigrationModalData(null)}
        onCompleted={async () => {
          await refreshTemplateQueries()
          setMigrationModalData(null)
        }}
      />
      </div>
  )
}