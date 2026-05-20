import { useEffect, useMemo, useState } from 'react'
import type { ProcessSchemaRead } from '../types/api'

interface BpmnPropertiesPanelProps {
  element: any | null
  availableRoles: string[]
  modeler: any | null
  onXmlChange?: (xml: string) => void
  schema: ProcessSchemaRead | null
  availableProcessKeys?: Array<{ key: string; name: string }>
}

interface VariableMapping {
  id: string
  source: string
  target: string
  isExpression: boolean
}

const makeLocalId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

const ensureFlowableNamespace = (modeler: any) => {
  try {
    const canvas = modeler.get('canvas')
    const rootElement = canvas.getRootElement()
    const definitions = rootElement?.businessObject?.$parent
    if (definitions && !definitions.$attrs?.['xmlns:flowable']) {
      if (!definitions.$attrs) definitions.$attrs = {}
      definitions.$attrs['xmlns:flowable'] = 'http://flowable.org/bpmn'
    }
  } catch (e) {
    // ignore
  }
}

const OPERATORS = [
  { value: '==', label: '== (равно)' },
  { value: '!=', label: '!= (не равно)' },
  { value: '>', label: '>  (больше)' },
  { value: '>=', label: '>= (больше или равно)' },
  { value: '<', label: '<  (меньше)' },
  { value: '<=', label: '<= (меньше или равно)' },
] as const

type ServiceTaskType = 'class' | 'expression' | 'delegateExpression' | 'startByMessage'

const SERVICE_TASK_ATTRS: Record<ServiceTaskType, string> = {
  class: 'flowable:class',
  expression: 'flowable:expression',
  delegateExpression: 'flowable:delegateExpression',
  startByMessage: 'flowable:expression',
}

const SERVICE_TASK_LABELS: Record<ServiceTaskType, string> = {
  class: 'Java Class',
  expression: 'Expression',
  delegateExpression: 'Delegate Expression',
  startByMessage: 'Запустить процесс по сообщению',
}

const EVENT_DEFINITION_LABELS: Record<string, string> = {
  'bpmn:TimerEventDefinition': 'Timer',
  'bpmn:ErrorEventDefinition': 'Error',
  'bpmn:SignalEventDefinition': 'Signal',
  'bpmn:MessageEventDefinition': 'Message',
  'bpmn:EscalationEventDefinition': 'Escalation',
  'bpmn:TerminateEventDefinition': 'Terminate',
}

const getEventDefinitionType = (bo: any): string => {
  const defs = bo?.eventDefinitions ?? []

  if (!defs.length) {
    return 'None'
  }

  const defType = defs[0]?.$type ?? ''
  return EVENT_DEFINITION_LABELS[defType] ?? defType
}

const getDefinitions = (modeler: any): any | null => {
  try {
    const elementRegistry = modeler.get('elementRegistry')
    const allElements = elementRegistry.getAll()

    for (const element of allElements) {
      const businessObject = element.businessObject
      if (businessObject?.$type === 'bpmn:Process' && businessObject.$parent?.$type === 'bpmn:Definitions') {
        return businessObject.$parent
      }
    }

    const canvas = modeler.get('canvas')
    const rootElement = canvas.getRootElement()
    const businessObject = rootElement?.businessObject
    if (businessObject?.$type === 'bpmn:Definitions') {
      return businessObject
    }
    if (businessObject?.$parent?.$type === 'bpmn:Definitions') {
      return businessObject.$parent
    }

    const moddle = modeler.get('moddle')
    if (moddle?.ids?._seed?.definitions?.$type === 'bpmn:Definitions') {
      return moddle.ids._seed.definitions
    }

    return null
  } catch (e) {
    console.error('getDefinitions error', e)
    return null
  }
}

const getDefinitionsMessages = (modeler: any): Array<{ id: string; name: string }> => {
  try {
    const definitions = getDefinitions(modeler)
    if (!definitions) return []

    return (definitions.rootElements ?? [])
      .filter((el: any) => el.$type === 'bpmn:Message')
      .map((el: any) => ({ id: el.id, name: el.name ?? '' }))
  } catch (e) {
    return []
  }
}

const getMessageEventDefinition = (bo: any): any | null => {
  const defs = bo?.eventDefinitions ?? []
  return defs.find((definition: any) => definition.$type === 'bpmn:MessageEventDefinition') ?? null
}

const getTimerEventDefinition = (bo: any): any | null => {
  const defs = bo?.eventDefinitions ?? []
  return defs.find((definition: any) => definition.$type === 'bpmn:TimerEventDefinition') ?? null
}

const getSignalEventDefinition = (bo: any): any | null => {
  const defs = bo?.eventDefinitions ?? []
  return defs.find((definition: any) => definition.$type === 'bpmn:SignalEventDefinition') ?? null
}

const getErrorEventDefinition = (bo: any): any | null => {
  const defs = bo?.eventDefinitions ?? []
  return defs.find((definition: any) => definition.$type === 'bpmn:ErrorEventDefinition') ?? null
}

const getEscalationEventDefinition = (bo: any): any | null => {
  const defs = bo?.eventDefinitions ?? []
  return defs.find((definition: any) => definition.$type === 'bpmn:EscalationEventDefinition') ?? null
}

const getDefinitionsSignals = (modeler: any): Array<{ id: string; name: string }> => {
  try {
    const definitions = getDefinitions(modeler)
    if (!definitions) return []

    return (definitions.rootElements ?? [])
      .filter((el: any) => el.$type === 'bpmn:Signal')
      .map((el: any) => ({ id: el.id, name: el.name ?? '' }))
  } catch (e) {
    return []
  }
}

const getDefinitionsErrors = (modeler: any): Array<{ id: string; name: string; errorCode?: string }> => {
  try {
    const definitions = getDefinitions(modeler)
    if (!definitions) return []

    return (definitions.rootElements ?? [])
      .filter((el: any) => el.$type === 'bpmn:Error')
      .map((el: any) => ({ id: el.id, name: el.name ?? '', errorCode: el.errorCode }))
  } catch (e) {
    return []
  }
}

const getDefinitionsEscalations = (modeler: any): Array<{ id: string; name: string; escalationCode?: string }> => {
  try {
    const definitions = getDefinitions(modeler)
    if (!definitions) return []

    return (definitions.rootElements ?? [])
      .filter((el: any) => el.$type === 'bpmn:Escalation')
      .map((el: any) => ({ id: el.id, name: el.name ?? '', escalationCode: el.escalationCode }))
  } catch (e) {
    return []
  }
}

const isMessageEvent = (bo: any): boolean => getMessageEventDefinition(bo) !== null

export function BpmnPropertiesPanel({ element, availableRoles, modeler, onXmlChange, schema, availableProcessKeys = [] }: BpmnPropertiesPanelProps) {
  const businessObject = element?.businessObject ?? null
  const type = businessObject?.$type ?? null

  // Shared state
  const [name, setName] = useState('')
  const [calledElement, setCalledElement] = useState('')
  const [calledElementType, setCalledElementType] = useState<'key' | 'id'>('key')
  const [messageName, setMessageName] = useState('')
  const [existingMessages, setExistingMessages] = useState<Array<{ id: string; name: string }>>([])
  const [timerType, setTimerType] = useState<'timeDate' | 'timeDuration' | 'timeCycle'>('timeDuration')
  const [timerValue, setTimerValue] = useState('')
  const [signalName, setSignalName] = useState('')
  const [existingSignals, setExistingSignals] = useState<Array<{ id: string; name: string }>>([])
  const [errorName, setErrorName] = useState('')
  const [errorCode, setErrorCode] = useState('')
  const [existingErrors, setExistingErrors] = useState<Array<{ id: string; name: string; errorCode?: string }>>([])
  const [escalationName, setEscalationName] = useState('')
  const [escalationCode, setEscalationCode] = useState('')
  const [existingEscalations, setExistingEscalations] = useState<Array<{ id: string; name: string; escalationCode?: string }>>([])
  const [inVariables, setInVariables] = useState<VariableMapping[]>([])
  const [outVariables, setOutVariables] = useState<VariableMapping[]>([])
  const [inheritVariables, setInheritVariables] = useState(false)
  const [inheritBusinessKey, setInheritBusinessKey] = useState(false)
  const [businessKey, setBusinessKey] = useState('')
  const [sameDeployment, setSameDeployment] = useState(false)
  const [asyncComplete, setAsyncComplete] = useState(false)
  const [fallbackToDefaultTenant, setFallbackToDefaultTenant] = useState(false)

  // UserTask state
  const [assignee, setAssignee] = useState('')

  // ServiceTask state
  const [serviceTaskType, setServiceTaskType] = useState<ServiceTaskType>('class')
  const [serviceTaskValue, setServiceTaskValue] = useState('')
  const [messageNameForProcess, setMessageNameForProcess] = useState('')

  // SequenceFlow condition state
  const [leftOperand, setLeftOperand] = useState('')
  const [operator, setOperator] = useState<(typeof OPERATORS)[number]['value']>('==')
  const [rightType, setRightType] = useState<'variable' | 'constant'>('variable')
  const [rightOperand, setRightOperand] = useState('')

  const availableVars = useMemo<string[]>(() => {
    const vars = new Set<string>()

    if (modeler) {
      try {
        const elementRegistry = modeler.get('elementRegistry')
        elementRegistry
          .getAll()
          .filter((el: any) => el.type === 'bpmn:UserTask')
          .forEach((el: any) => {
            const role = el.businessObject?.['flowable:assignee'] ?? el.businessObject?.assignee
            if (role) vars.add(`${role}Approved`)
          })
      } catch (e) {
        // ignore
      }
    }

    if (schema) {
      schema.roles.forEach((role) => {
        role.variables.forEach((variable) => vars.add(variable.name))
      })
    }

    return Array.from(vars).sort()
  }, [modeler, schema])

  const buildExpression = () => {
    if (!leftOperand.trim() || !rightOperand.trim()) return ''
    const right = rightOperand.trim()
    return `\${${leftOperand.trim()} ${operator} ${right}}`
  }

  const parseCondition = (body: string) => {
    const inner = body.replace(/^\$\{/, '').replace(/\}$/, '').trim()
    const match = inner.match(/^(\w+)\s*(==|!=|>=|<=|>|<)\s*(.+)$/)

    if (!match) {
      setLeftOperand('')
      setOperator('==')
      setRightType('variable')
      setRightOperand('')
      return
    }

    setLeftOperand(match[1])
    setOperator(match[2] as (typeof OPERATORS)[number]['value'])

    const right = match[3].trim()
    const isConstant = /^(\d+(\.\d+)?|true|false|'.*'|".*")$/.test(right)
    setRightType(isConstant ? 'constant' : 'variable')
    setRightOperand(right)
  }

  useEffect(() => {
    if (!businessObject) return

    const attrs = businessObject.$attrs || {}

    setName(businessObject.name ?? '')
    setAssignee('')
    setServiceTaskType('class')
    setServiceTaskValue('')
    setMessageNameForProcess('')
    setCalledElement(businessObject.calledElement ?? attrs.calledElement ?? '')
    setCalledElementType('key')
    setMessageName('')
    setExistingMessages([])
    setTimerType('timeDuration')
    setTimerValue('')
    setSignalName('')
    setExistingSignals([])
    setErrorName('')
    setErrorCode('')
    setExistingErrors([])
    setEscalationName('')
    setEscalationCode('')
    setExistingEscalations([])
    setInVariables([])
    setOutVariables([])
    setInheritVariables(false)
    setInheritBusinessKey(false)
    setBusinessKey('')
    setSameDeployment(false)
    setAsyncComplete(false)
    setFallbackToDefaultTenant(false)

    if (type === 'bpmn:UserTask') {
      setAssignee(attrs['flowable:assignee'] ?? businessObject.assignee ?? '')
    }

    if (type === 'bpmn:StartEvent' || type === 'bpmn:EndEvent') {
      if (isMessageEvent(businessObject)) {
        const msgDef = getMessageEventDefinition(businessObject)
        const currentName = msgDef?.messageRef?.name ?? ''
        setMessageName(currentName)

        if (modeler) {
          setExistingMessages(getDefinitionsMessages(modeler))
        }
      }
    }

    if (type === 'bpmn:IntermediateThrowEvent' || type === 'bpmn:IntermediateCatchEvent') {
      if (isMessageEvent(businessObject)) {
        const msgDef = getMessageEventDefinition(businessObject)
        setMessageName(msgDef?.messageRef?.name ?? '')
        if (modeler) {
          setExistingMessages(getDefinitionsMessages(modeler))
        }
      } else {
        setMessageName('')
        setExistingMessages([])
      }
    }

    if (type === 'bpmn:StartEvent' || type === 'bpmn:BoundaryEvent' || type === 'bpmn:IntermediateCatchEvent' || type === 'bpmn:IntermediateThrowEvent') {
      const timerDef = getTimerEventDefinition(businessObject)
      if (timerDef) {
        if (timerDef.timeDate) {
          setTimerType('timeDate')
          setTimerValue(timerDef.timeDate.body ?? timerDef.timeDate ?? '')
        } else if (timerDef.timeDuration) {
          setTimerType('timeDuration')
          setTimerValue(timerDef.timeDuration.body ?? timerDef.timeDuration ?? '')
        } else if (timerDef.timeCycle) {
          setTimerType('timeCycle')
          setTimerValue(timerDef.timeCycle.body ?? timerDef.timeCycle ?? '')
        }
      }
    }

    if (type === 'bpmn:StartEvent' || type === 'bpmn:IntermediateCatchEvent' || type === 'bpmn:IntermediateThrowEvent') {
      const signalDef = getSignalEventDefinition(businessObject)
      if (signalDef) {
        setSignalName(signalDef.signalRef?.name ?? '')
        if (modeler) {
          setExistingSignals(getDefinitionsSignals(modeler))
        }
      }
    }

    if (type === 'bpmn:EndEvent' || type === 'bpmn:BoundaryEvent' || type === 'bpmn:IntermediateCatchEvent' || type === 'bpmn:IntermediateThrowEvent') {
      const errorDef = getErrorEventDefinition(businessObject)
      if (errorDef) {
        setErrorName(errorDef.errorRef?.name ?? '')
        setErrorCode(errorDef.errorRef?.errorCode ?? '')
        if (modeler) {
          setExistingErrors(getDefinitionsErrors(modeler))
        }
      }

      const escalationDef = getEscalationEventDefinition(businessObject)
      if (escalationDef) {
        setEscalationName(escalationDef.escalationRef?.name ?? '')
        setEscalationCode(escalationDef.escalationRef?.escalationCode ?? '')
        if (modeler) {
          setExistingEscalations(getDefinitionsEscalations(modeler))
        }
      }
    }

    if (type === 'bpmn:ServiceTask') {
      if (attrs['flowable:class']) {
        setServiceTaskType('class')
        setServiceTaskValue(attrs['flowable:class'])
      } else if (attrs['flowable:expression']) {
        const expressionVal = attrs['flowable:expression'] ?? ''
        if (expressionVal.includes('startProcessInstanceByMessage')) {
          setServiceTaskType('startByMessage')
          const match = expressionVal.match(/startProcessInstanceByMessage\('([^']+)'\)/)
          setMessageNameForProcess(match?.[1] ?? '')
          setServiceTaskValue(expressionVal)
        } else {
          setServiceTaskType('expression')
          setServiceTaskValue(expressionVal)
        }
      } else if (attrs['flowable:delegateExpression']) {
        setServiceTaskType('delegateExpression')
        setServiceTaskValue(attrs['flowable:delegateExpression'])
      }
    }

    if (type === 'bpmn:CallActivity') {
      setCalledElement(businessObject.calledElement ?? '')
      setCalledElementType(attrs['flowable:calledElementType'] === 'id' ? 'id' : 'key')
      setInheritVariables(attrs['flowable:inheritVariables'] === 'true' || attrs['flowable:inheritVariables'] === true)
      setInheritBusinessKey(attrs['flowable:inheritBusinessKey'] === 'true' || attrs['flowable:inheritBusinessKey'] === true)
      setBusinessKey(attrs['flowable:businessKey'] ?? '')
      setSameDeployment(attrs['flowable:sameDeployment'] === 'true' || attrs['flowable:sameDeployment'] === true)
      setAsyncComplete(attrs['flowable:asyncComplete'] === 'true' || attrs['flowable:asyncComplete'] === true)
      setFallbackToDefaultTenant(attrs['flowable:fallbackToDefaultTenant'] === 'true' || attrs['flowable:fallbackToDefaultTenant'] === true)

      const extElements = businessObject.extensionElements?.values ?? []
      const nextIn: VariableMapping[] = []
      const nextOut: VariableMapping[] = []

      extElements.forEach((ext: any) => {
        if (ext.$type === 'flowable:In') {
          nextIn.push({
            id: makeLocalId(),
            source: ext.source ?? ext.sourceExpression ?? '',
            target: ext.target ?? '',
            isExpression: Boolean(ext.sourceExpression),
          })
        }

        if (ext.$type === 'flowable:Out') {
          nextOut.push({
            id: makeLocalId(),
            source: ext.source ?? ext.sourceExpression ?? '',
            target: ext.target ?? '',
            isExpression: Boolean(ext.sourceExpression),
          })
        }
      })

      setInVariables(nextIn)
      setOutVariables(nextOut)
    }

    if (type === 'bpmn:SequenceFlow') {
      const currentCondition = businessObject?.conditionExpression?.body ?? ''
      parseCondition(currentCondition)
    } else {
      setLeftOperand('')
      setOperator('==')
      setRightType('variable')
      setRightOperand('')
    }
  }, [businessObject, type, modeler])

  const updateName = (nextName: string) => {
    if (!modeler || !element) return
    try {
      modeler.get('modeling').updateProperties(element, { name: nextName })
      setName(nextName)
    } catch (e) {
      console.error('updateName error', e)
    }
  }

  const updateAssignee = async (nextAssignee: string) => {
    if (!modeler || !element) return
    try {
      // Гарантировать наличие flowable namespace в корне
      ensureFlowableNamespace(modeler)

      const bo = element.businessObject
      if (!bo.$attrs) {
        bo.$attrs = {}
      }
      if (nextAssignee) {
        bo.$attrs['flowable:assignee'] = nextAssignee
      } else {
        delete bo.$attrs['flowable:assignee']
      }

      // Уведомляем modeler об изменении элемента (перерисовка)
      modeler.get('eventBus').fire('elements.changed', { elements: [element] })

      // Принудительно сохранить XML и передать наружу
      const { xml } = await modeler.saveXML({ format: true })
      onXmlChange?.(xml)

      setAssignee(nextAssignee)
    } catch (e) {
      console.error('updateAssignee error', e)
    }
  }

  const updateServiceTask = async (nextType: ServiceTaskType, nextValue: string) => {
    if (!modeler || !element) return

    try {
      ensureFlowableNamespace(modeler)

      const bo = element.businessObject
      if (!bo.$attrs) {
        bo.$attrs = {}
      }

      delete bo.$attrs['flowable:class']
      delete bo.$attrs['flowable:expression']
      delete bo.$attrs['flowable:delegateExpression']

      const attrName = SERVICE_TASK_ATTRS[nextType]
      if (nextValue.trim()) {
        bo.$attrs[attrName] = nextValue.trim()
      }

      modeler.get('eventBus').fire('elements.changed', { elements: [element] })

      const { xml } = await modeler.saveXML({ format: true })
      onXmlChange?.(xml)

      setServiceTaskType(nextType)
      setServiceTaskValue(nextValue)
    } catch (e) {
      console.error('updateServiceTask error', e)
    }
  }

  const updateStartByMessage = async (msgName: string) => {
    const expression = `\${runtimeService.startProcessInstanceByMessage('${msgName}')}`
    await updateServiceTask('startByMessage', expression)
    setMessageNameForProcess(msgName)
  }

  const handleServiceTaskTypeChange = async (nextType: ServiceTaskType) => {
    if (nextType === 'startByMessage') {
      setServiceTaskType(nextType)
      setServiceTaskValue('')
      return
    }

    setMessageNameForProcess('')
    await updateServiceTask(nextType, serviceTaskValue)
  }

  const applyCallActivity = async () => {
    if (!modeler || !element || !calledElement.trim()) return

    try {
      ensureFlowableNamespace(modeler)

      const bo = element.businessObject
      const moddle = modeler.get('moddle')
      const modeling = modeler.get('modeling')
      const eventBus = modeler.get('eventBus')

      // 1. calledElement — писать напрямую в businessObject
      //    modeling.updateProperties не сериализует calledElement корректно
      bo.calledElement = calledElement.trim()

      // 2. name — через modeling (стандартное свойство)
      if (name.trim()) {
        modeling.updateProperties(element, { name: name.trim() })
      }

      // 3. Все flowable:* атрибуты — через $attrs
      if (!bo.$attrs) bo.$attrs = {}

      // calledElementType — только если id, иначе удалить
      if (calledElementType === 'id') {
        bo.$attrs['flowable:calledElementType'] = 'id'
      } else {
        delete bo.$attrs['flowable:calledElementType']
      }

      // Булевые флаги
      const applyBoolAttr = (key: string, value: boolean) => {
        if (value) {
          bo.$attrs[key] = 'true'
        } else {
          delete bo.$attrs[key]
        }
      }

      applyBoolAttr('flowable:inheritVariables', inheritVariables)
      applyBoolAttr('flowable:inheritBusinessKey', inheritBusinessKey)
      applyBoolAttr('flowable:sameDeployment', sameDeployment)
      applyBoolAttr('flowable:asyncComplete', asyncComplete)
      applyBoolAttr('flowable:fallbackToDefaultTenant', fallbackToDefaultTenant)

      // businessKey — строка/expression
      if (businessKey.trim()) {
        bo.$attrs['flowable:businessKey'] = businessKey.trim()
      } else {
        delete bo.$attrs['flowable:businessKey']
      }

      // 4. extensionElements — flowable:in и flowable:out
      const validIn = inVariables.filter((v) => v.source.trim() && v.target.trim())
      const validOut = outVariables.filter((v) => v.source.trim() && v.target.trim())

      if (validIn.length > 0 || validOut.length > 0) {
        const mappings = [
          ...validIn.map((v) => {
            const attrs: any = { target: v.target.trim() }
            if (v.isExpression) {
              attrs.sourceExpression = v.source.trim()
            } else {
              attrs.source = v.source.trim()
            }
            return moddle.create('flowable:In', attrs)
          }),
          ...validOut.map((v) => {
            const attrs: any = { target: v.target.trim() }
            if (v.isExpression) {
              attrs.sourceExpression = v.source.trim()
            } else {
              attrs.source = v.source.trim()
            }
            return moddle.create('flowable:Out', attrs)
          }),
        ]

        const extensionElements = bo.extensionElements ?? moddle.create('bpmn:ExtensionElements', { values: [] })

        // Очистить старые flowable:In и flowable:Out
        extensionElements.values = (extensionElements.values ?? []).filter(
          (value: any) => value.$type !== 'flowable:In' && value.$type !== 'flowable:Out',
        )

        extensionElements.values = [...extensionElements.values, ...mappings]
        extensionElements.$parent = bo
        mappings.forEach((mapping) => {
          mapping.$parent = extensionElements
        })

        bo.extensionElements = extensionElements
      } else {
        // Очистить extensionElements если маппингов нет
        if (bo.extensionElements) {
          bo.extensionElements.values = (bo.extensionElements.values ?? []).filter(
            (value: any) => value.$type !== 'flowable:In' && value.$type !== 'flowable:Out',
          )

          if (bo.extensionElements.values.length === 0) {
            bo.extensionElements = undefined
          }
        }
      }

      // 5. Уведомить canvas и сохранить
      eventBus.fire('elements.changed', { elements: [element] })

      const { xml } = await modeler.saveXML({ format: true })

      // Отладка — проверить что calledElement попал в XML
      console.log('calledElement in XML:', xml.includes(`calledElement="${calledElement.trim()}"`))

      onXmlChange?.(xml)
    } catch (e) {
      console.error('applyCallActivity error', e)
    }
  }

  const addCallMapping = (direction: 'in' | 'out') => {
    const nextItem: VariableMapping = {
      id: makeLocalId(),
      source: '',
      target: '',
      isExpression: false,
    }

    if (direction === 'in') {
      setInVariables((prev) => [...prev, nextItem])
      return
    }

    setOutVariables((prev) => [...prev, nextItem])
  }

  const updateCallMapping = (
    direction: 'in' | 'out',
    id: string,
    patch: Partial<Pick<VariableMapping, 'source' | 'target' | 'isExpression'>>,
  ) => {
    const updater = (list: VariableMapping[]) => list.map((item) => (item.id === id ? { ...item, ...patch } : item))

    if (direction === 'in') {
      setInVariables(updater)
      return
    }

    setOutVariables(updater)
  }

  const removeCallMapping = (direction: 'in' | 'out', id: string) => {
    if (direction === 'in') {
      setInVariables((prev) => prev.filter((item) => item.id !== id))
      return
    }

    setOutVariables((prev) => prev.filter((item) => item.id !== id))
  }

  const applyMessageRef = async (nextMessageName: string) => {
    if (!modeler || !element || !nextMessageName.trim()) return

    try {
      const moddle = modeler.get('moddle')
      const modeling = modeler.get('modeling')

      const definitions = getDefinitions(modeler)
      if (!definitions) {
        console.error('applyMessageRef: bpmn:Definitions not found')
        return
      }

      const trimmed = nextMessageName.trim()
      const msgId = trimmed
      const msgName = trimmed

      if (!definitions.rootElements) {
        definitions.rootElements = []
      }

      const rootElements = definitions.rootElements ?? []

      let messageElement = rootElements.find(
        (rootElementItem: any) => rootElementItem.$type === 'bpmn:Message' && rootElementItem.name === msgName,
      ) ?? rootElements.find((rootElementItem: any) => rootElementItem.$type === 'bpmn:Message' && rootElementItem.id === msgId)

      if (!messageElement) {
        messageElement = moddle.create('bpmn:Message', {
          id: msgId,
          name: msgName,
        })

        definitions.rootElements = [...rootElements, messageElement]
        messageElement.$parent = definitions
      }

      const messageEventDefinition = getMessageEventDefinition(element.businessObject)
      if (messageEventDefinition) {
        messageEventDefinition.messageRef = messageElement
      } else {
        console.error('No MessageEventDefinition on element:', element.businessObject?.id)
        return
      }

      modeling.updateProperties(element, { name: trimmed })
      modeler.get('eventBus').fire('elements.changed', { elements: [element] })

      const { xml } = await modeler.saveXML({ format: true })
      console.log('message in XML:', xml.includes(msgId), '| messageRef in XML:', xml.includes(`messageRef="${msgId}"`))
      onXmlChange?.(xml)

      setExistingMessages(getDefinitionsMessages(modeler))
      setMessageName(trimmed)
      setName(trimmed)
    } catch (e) {
      console.error('applyMessageRef error', e)
    }
  }

  const applyTimer = async (nextType: 'timeDate' | 'timeDuration' | 'timeCycle', nextValue: string) => {
    if (!modeler || !element || !nextValue.trim()) return

    try {
      const moddle = modeler.get('moddle')
      const timerDef = getTimerEventDefinition(element.businessObject)
      if (!timerDef) return

      timerDef.timeDate = undefined
      timerDef.timeDuration = undefined
      timerDef.timeCycle = undefined

      const expr = moddle.create('bpmn:FormalExpression', { body: nextValue.trim() })
      if (nextType === 'timeDate') timerDef.timeDate = expr
      if (nextType === 'timeDuration') timerDef.timeDuration = expr
      if (nextType === 'timeCycle') timerDef.timeCycle = expr

      modeler.get('eventBus').fire('elements.changed', { elements: [element] })
      const { xml } = await modeler.saveXML({ format: true })
      onXmlChange?.(xml)
      setTimerType(nextType)
      setTimerValue(nextValue.trim())
    } catch (e) {
      console.error('applyTimer error', e)
    }
  }

  const applySignal = async (nextSignalName: string) => {
    if (!modeler || !element || !nextSignalName.trim()) return

    try {
      const moddle = modeler.get('moddle')
      const definitions = getDefinitions(modeler)
      if (!definitions) return

      const trimmed = nextSignalName.trim()
      const sigId = `Signal_${trimmed.replace(/[^a-zA-Z0-9]/g, '_')}`

      if (!definitions.rootElements) definitions.rootElements = []

      let signalElement = definitions.rootElements.find((el: any) => el.$type === 'bpmn:Signal' && el.name === trimmed)
      if (!signalElement) {
        signalElement = moddle.create('bpmn:Signal', { id: sigId, name: trimmed })
        signalElement.$parent = definitions
        definitions.rootElements = [...definitions.rootElements, signalElement]
      }

      const signalDef = getSignalEventDefinition(element.businessObject)
      if (!signalDef) return
      signalDef.signalRef = signalElement

      modeler.get('modeling').updateProperties(element, { name: trimmed })
      modeler.get('eventBus').fire('elements.changed', { elements: [element] })

      const { xml } = await modeler.saveXML({ format: true })
      onXmlChange?.(xml)
      setExistingSignals(getDefinitionsSignals(modeler))
      setSignalName(trimmed)
      setName(trimmed)
    } catch (e) {
      console.error('applySignal error', e)
    }
  }

  const applyError = async (nextErrorName: string, nextErrorCode: string) => {
    if (!modeler || !element || !nextErrorName.trim()) return

    try {
      const moddle = modeler.get('moddle')
      const definitions = getDefinitions(modeler)
      if (!definitions) return

      const trimmed = nextErrorName.trim()
      const errId = `Error_${trimmed.replace(/[^a-zA-Z0-9]/g, '_')}`

      if (!definitions.rootElements) definitions.rootElements = []

      let errorElement = definitions.rootElements.find((el: any) => el.$type === 'bpmn:Error' && el.name === trimmed)
      if (!errorElement) {
        errorElement = moddle.create('bpmn:Error', {
          id: errId,
          name: trimmed,
          errorCode: nextErrorCode.trim() || trimmed,
        })
        errorElement.$parent = definitions
        definitions.rootElements = [...definitions.rootElements, errorElement]
      } else if (nextErrorCode.trim()) {
        errorElement.errorCode = nextErrorCode.trim()
      }

      const errorDef = getErrorEventDefinition(element.businessObject)
      if (!errorDef) return
      errorDef.errorRef = errorElement

      modeler.get('modeling').updateProperties(element, { name: trimmed })
      modeler.get('eventBus').fire('elements.changed', { elements: [element] })

      const { xml } = await modeler.saveXML({ format: true })
      onXmlChange?.(xml)
      setExistingErrors(getDefinitionsErrors(modeler))
      setErrorName(trimmed)
      setErrorCode(nextErrorCode.trim())
      setName(trimmed)
    } catch (e) {
      console.error('applyError error', e)
    }
  }

  const applyEscalation = async (nextEscalationName: string, nextEscalationCode: string) => {
    if (!modeler || !element || !nextEscalationName.trim()) return

    try {
      const moddle = modeler.get('moddle')
      const definitions = getDefinitions(modeler)
      if (!definitions) return

      const trimmed = nextEscalationName.trim()
      const escId = `Escalation_${trimmed.replace(/[^a-zA-Z0-9]/g, '_')}`

      if (!definitions.rootElements) definitions.rootElements = []

      let escElement = definitions.rootElements.find((el: any) => el.$type === 'bpmn:Escalation' && el.name === trimmed)
      if (!escElement) {
        escElement = moddle.create('bpmn:Escalation', {
          id: escId,
          name: trimmed,
          escalationCode: nextEscalationCode.trim() || trimmed,
        })
        escElement.$parent = definitions
        definitions.rootElements = [...definitions.rootElements, escElement]
      } else if (nextEscalationCode.trim()) {
        escElement.escalationCode = nextEscalationCode.trim()
      }

      const escalationDef = getEscalationEventDefinition(element.businessObject)
      if (!escalationDef) return
      escalationDef.escalationRef = escElement

      modeler.get('modeling').updateProperties(element, { name: trimmed })
      modeler.get('eventBus').fire('elements.changed', { elements: [element] })

      const { xml } = await modeler.saveXML({ format: true })
      onXmlChange?.(xml)
      setExistingEscalations(getDefinitionsEscalations(modeler))
      setEscalationName(trimmed)
      setEscalationCode(nextEscalationCode.trim())
      setName(trimmed)
    } catch (e) {
      console.error('applyEscalation error', e)
    }
  }

  const updateCondition = (expression: string) => {
    if (!modeler || !element) return
    try {
      const modeling = modeler.get('modeling')
      const moddle = modeler.get('moddle')
      const conditionExpression = moddle.create('bpmn:FormalExpression', { body: expression })
      modeling.updateProperties(element, { conditionExpression })
      // Уведомляем modeler об изменении
      modeler.get('eventBus').fire('elements.changed', { elements: [element] })
      parseCondition(expression)
    } catch (e) {
      console.error('updateCondition error', e)
    }
  }

  const eventDefinitionType = getEventDefinitionType(businessObject)

  const renderEventDefinitionPanel = () => {
    if (eventDefinitionType === 'Timer') {
      return (
        <div className="mt-4 rounded-2xl border border-orange-100 bg-orange-50 p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-orange-900">⏱ Timer настройка</div>
            <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-orange-700">Timer</span>
          </div>

          <div className="mt-3 text-sm font-medium text-slate-700">Тип таймера</div>
          <div className="mt-2 space-y-2">
            {[
              { value: 'timeDate' as const, label: 'Конкретная дата (timeDate)' },
              { value: 'timeDuration' as const, label: 'Задержка (timeDuration)' },
              { value: 'timeCycle' as const, label: 'Повтор (timeCycle)' },
            ].map((item) => (
              <label key={item.value} className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 hover:border-orange-300">
                <input
                  type="radio"
                  name="timerType"
                  checked={timerType === item.value}
                  onChange={() => setTimerType(item.value)}
                />
                <span className="text-sm text-slate-700">{item.label}</span>
              </label>
            ))}
          </div>

          <div className="mt-3 text-sm font-medium text-slate-700">Значение</div>
          <input
            value={timerValue}
            onChange={(e) => setTimerValue(e.target.value)}
            placeholder={timerType === 'timeDate' ? '2024-12-31T23:59:59' : timerType === 'timeCycle' ? 'R3/PT10H' : 'PT1H30M'}
            className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-mono"
          />

          {timerValue.trim() ? (
            <div className="mt-3 rounded-lg bg-white border border-slate-200 p-2">
              <div className="text-xs text-slate-400 mb-1">В XML:</div>
              <div className="font-mono text-xs text-slate-600">
                {`<timerEventDefinition>`}
              </div>
              <div className="font-mono text-xs text-slate-600 ml-2">
                {`<${timerType}>${timerValue.trim()}</${timerType}>`}
              </div>
              <div className="font-mono text-xs text-slate-600">
                {`</timerEventDefinition>`}
              </div>
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => void applyTimer(timerType, timerValue)}
            disabled={!timerValue.trim()}
            className={['mt-3 w-full rounded-xl py-2 text-sm font-semibold transition', timerValue.trim() ? 'bg-orange-500 text-white hover:bg-orange-600' : 'cursor-not-allowed bg-slate-200 text-slate-400'].join(' ')}
          >
            Применить таймер
          </button>
        </div>
      )
    }

    if (eventDefinitionType === 'Signal') {
      const signalRefName = getSignalEventDefinition(businessObject)?.signalRef?.name ?? null

      return (
        <div className="mt-4 rounded-2xl border border-purple-100 bg-purple-50 p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-purple-900">📡 Signal настройка</div>
            {signalRefName ? (
              <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-700">✓ привязано</span>
            ) : (
              <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700">! не задано</span>
            )}
          </div>

          <div className="mt-1 text-xs text-purple-600">Signal — широковещательный. Все процессы с подпиской на это имя получат его.</div>

          {signalRefName ? (
            <div className="mt-2 rounded-lg border border-green-200 bg-white px-3 py-2">
              <div className="text-xs text-slate-500">Текущий сигнал:</div>
              <div className="mt-1 font-mono text-sm font-semibold text-purple-700">{signalRefName}</div>
            </div>
          ) : null}

          <div className="mt-3 text-sm font-medium text-slate-700">Имя сигнала</div>
          <input
            list="signals-datalist"
            value={signalName}
            onChange={(e) => setSignalName(e.target.value)}
            placeholder="например: orderApproved, policyChanged"
            className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          />
          <datalist id="signals-datalist">
            {existingSignals.map((signal) => (
              <option key={signal.id} value={signal.name} />
            ))}
          </datalist>

          {existingSignals.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {existingSignals.map((signal) => (
                <button
                  key={signal.id}
                  type="button"
                  onClick={() => setSignalName(signal.name)}
                  className={['rounded-lg px-2 py-1 text-xs font-medium transition', signalName === signal.name ? 'bg-purple-600 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:border-purple-300'].join(' ')}
                >
                  {signal.name}
                </button>
              ))}
            </div>
          ) : null}

          {signalName.trim() ? (
            <div className="mt-3 rounded-lg border border-slate-200 bg-white p-2">
              <div className="text-xs text-slate-400 mb-1">В XML:</div>
              <div className="font-mono text-xs text-slate-600">{`<signal id="Signal_${signalName.trim().replace(/[^a-zA-Z0-9]/g, '_')}" name="${signalName.trim()}"/>`}</div>
              <div className="font-mono text-xs text-slate-600">{`<signalEventDefinition signalRef="Signal_${signalName.trim().replace(/[^a-zA-Z0-9]/g, '_')}"/>`}</div>
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => void applySignal(signalName)}
            disabled={!signalName.trim() || signalName.trim() === signalRefName}
            className={['mt-3 w-full rounded-xl py-2 text-sm font-semibold transition', signalName.trim() && signalName.trim() !== signalRefName ? 'bg-purple-600 text-white hover:bg-purple-700' : 'cursor-not-allowed bg-slate-200 text-slate-400'].join(' ')}
          >
            {signalName.trim() === signalRefName ? '✓ Уже применено' : 'Применить signal'}
          </button>
        </div>
      )
    }

    if (eventDefinitionType === 'Error') {
      const errorRef = getErrorEventDefinition(businessObject)?.errorRef ?? null
      const currentName = errorRef?.name ?? null

      return (
        <div className="mt-4 rounded-2xl border border-red-100 bg-red-50 p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-red-900">❌ Error настройка</div>
            {currentName ? (
              <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-700">✓ привязано</span>
            ) : (
              <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700">! не задано</span>
            )}
          </div>
          <div className="mt-1 text-xs text-red-600">BPMN Error — бизнес-исключение. Не то же самое, что Java Exception.</div>

          {currentName ? (
            <div className="mt-2 rounded-lg border border-green-200 bg-white px-3 py-2">
              <div className="text-xs text-slate-500">Текущая ошибка:</div>
              <div className="font-mono text-sm font-semibold text-red-700">{currentName}</div>
            </div>
          ) : null}

          <div className="mt-3 text-sm font-medium text-slate-700">Имя ошибки</div>
          <input
            list="errors-datalist"
            value={errorName}
            onChange={(e) => setErrorName(e.target.value)}
            placeholder="например: InsufficientFunds, ValidationError"
            className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          />
          <datalist id="errors-datalist">
            {existingErrors.map((error) => (
              <option key={error.id} value={error.name} />
            ))}
          </datalist>

          <div className="mt-3 text-sm font-medium text-slate-700">Error Code</div>
          <input
            value={errorCode}
            onChange={(e) => setErrorCode(e.target.value)}
            placeholder="например: ERR_001"
            className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-mono"
          />

          {errorName.trim() ? (
            <div className="mt-3 rounded-lg border border-slate-200 bg-white p-2">
              <div className="text-xs text-slate-400 mb-1">В XML:</div>
              <div className="font-mono text-xs text-slate-600">{`<error id="Error_${errorName.trim().replace(/[^a-zA-Z0-9]/g, '_')}" name="${errorName.trim()}"${errorCode.trim() ? ` errorCode="${errorCode.trim()}"` : ''}/>`}</div>
              <div className="font-mono text-xs text-slate-600">{`<errorEventDefinition errorRef="Error_${errorName.trim().replace(/[^a-zA-Z0-9]/g, '_')}"/>`}</div>
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => void applyError(errorName, errorCode)}
            disabled={!errorName.trim() || errorName.trim() === currentName}
            className={['mt-3 w-full rounded-xl py-2 text-sm font-semibold transition', errorName.trim() && errorName.trim() !== currentName ? 'bg-red-600 text-white hover:bg-red-700' : 'cursor-not-allowed bg-slate-200 text-slate-400'].join(' ')}
          >
            {errorName.trim() === currentName ? '✓ Уже применено' : 'Применить error'}
          </button>
        </div>
      )
    }

    if (eventDefinitionType === 'Escalation') {
      const escalationRef = getEscalationEventDefinition(businessObject)?.escalationRef ?? null
      const currentName = escalationRef?.name ?? null

      return (
        <div className="mt-4 rounded-2xl border border-amber-100 bg-amber-50 p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-amber-900">⬆ Escalation настройка</div>
            {currentName ? (
              <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-700">✓ привязано</span>
            ) : (
              <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700">! не задано</span>
            )}
          </div>
          <div className="mt-1 text-xs text-amber-700">Escalation обычно передаётся вверх по иерархии процесса и не прерывает поведение как Error.</div>

          {currentName ? (
            <div className="mt-2 rounded-lg border border-green-200 bg-white px-3 py-2">
              <div className="text-xs text-slate-500">Текущая эскалация:</div>
              <div className="font-mono text-sm font-semibold text-amber-700">{currentName}</div>
            </div>
          ) : null}

          <div className="mt-3 text-sm font-medium text-slate-700">Имя эскалации</div>
          <input
            list="escalations-datalist"
            value={escalationName}
            onChange={(e) => setEscalationName(e.target.value)}
            placeholder="например: ManagerAlert, SLAExceeded"
            className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          />
          <datalist id="escalations-datalist">
            {existingEscalations.map((escalation) => (
              <option key={escalation.id} value={escalation.name} />
            ))}
          </datalist>

          <div className="mt-3 text-sm font-medium text-slate-700">Escalation Code</div>
          <input
            value={escalationCode}
            onChange={(e) => setEscalationCode(e.target.value)}
            placeholder="например: ESC_001"
            className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-mono"
          />

          {escalationName.trim() ? (
            <div className="mt-3 rounded-lg border border-slate-200 bg-white p-2">
              <div className="text-xs text-slate-400 mb-1">В XML:</div>
              <div className="font-mono text-xs text-slate-600">{`<escalation id="Escalation_${escalationName.trim().replace(/[^a-zA-Z0-9]/g, '_')}" name="${escalationName.trim()}"${escalationCode.trim() ? ` escalationCode="${escalationCode.trim()}"` : ''}/>`}</div>
              <div className="font-mono text-xs text-slate-600">{`<escalationEventDefinition escalationRef="Escalation_${escalationName.trim().replace(/[^a-zA-Z0-9]/g, '_')}"/>`}</div>
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => void applyEscalation(escalationName, escalationCode)}
            disabled={!escalationName.trim() || escalationName.trim() === currentName}
            className={['mt-3 w-full rounded-xl py-2 text-sm font-semibold transition', escalationName.trim() && escalationName.trim() !== currentName ? 'bg-amber-600 text-white hover:bg-amber-700' : 'cursor-not-allowed bg-slate-200 text-slate-400'].join(' ')}
          >
            {escalationName.trim() === currentName ? '✓ Уже применено' : 'Применить escalation'}
          </button>
        </div>
      )
    }

    if (eventDefinitionType === 'Terminate') {
      return (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          🔴 Terminate Event — немедленно завершает весь процесс. Настройка не требуется.
        </div>
      )
    }

    return null
  }

  if (!businessObject) {
    return <div className="p-4 text-sm text-slate-500">Элемент не выбран</div>
  }

  // Render
  return (
    <div className="p-4">
      {(type === 'bpmn:IntermediateThrowEvent' || type === 'bpmn:IntermediateCatchEvent') ? (() => {
        const isThrow = type === 'bpmn:IntermediateThrowEvent'
        const isMsg = isMessageEvent(businessObject)
        const msgDef = getMessageEventDefinition(businessObject)
        const currentRef = msgDef?.messageRef?.name ?? null

        return (
          <div>
            <div className="text-sm font-semibold">
              {isThrow ? 'Intermediate Throw Event' : 'Intermediate Catch Event'}
            </div>
            <div className="mt-2 text-xs text-slate-500">ID: {businessObject.id}</div>

            <div
              className={[
                'mt-3 flex items-center gap-3 rounded-xl px-3 py-2',
                isMsg ? 'bg-blue-50' : 'bg-slate-50',
              ].join(' ')}
            >
              <span className="text-lg">{isMsg ? (isThrow ? '📤' : '📨') : '⚡'}</span>
              <div>
                <div className={`text-sm font-semibold ${isMsg ? 'text-blue-700' : 'text-slate-600'}`}>
                  {isMsg ? (isThrow ? 'Message Throw' : 'Message Catch') : getEventDefinitionType(businessObject)}
                </div>
                <div className="text-xs text-slate-500">
                  {isMsg
                    ? isThrow
                      ? 'Отправляет сообщение — запускает другой процесс или catch event'
                      : 'Ждёт входящее сообщение перед продолжением процесса'
                    : 'Промежуточное событие'}
                </div>
              </div>
            </div>

            <div className="mt-4 text-sm font-medium">Название</div>
            <input
              value={name}
              onChange={(e) => updateName(e.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />

            {!isMsg ? renderEventDefinitionPanel() : null}

            {isMsg && (
              <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-blue-900">
                    {isThrow ? '📤 Отправляет сообщение' : '📨 Ожидает сообщение'}
                  </div>
                  {currentRef ? (
                    <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-700">✓ привязано</span>
                  ) : (
                    <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700">! не задано</span>
                  )}
                </div>

                {currentRef && (
                  <div className="mt-2 rounded-lg border border-green-200 bg-white px-3 py-2">
                    <div className="text-xs text-slate-500">Текущее сообщение:</div>
                    <div className="mt-1 font-mono text-sm font-semibold text-blue-700">{currentRef}</div>
                  </div>
                )}

                <div className="mt-3 border-t border-blue-100 pt-3">
                  <div className="mb-2 text-xs font-semibold text-slate-600">
                    {currentRef ? 'Изменить сообщение:' : 'Задать имя сообщения:'}
                  </div>

                  <input
                    list="intermediate-messages-datalist"
                    value={messageName}
                    onChange={(e) => setMessageName(e.target.value)}
                    placeholder="например: approvalCompleted, orderReady"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  />
                  <datalist id="intermediate-messages-datalist">
                    {existingMessages.map((msg) => (
                      <option key={msg.id} value={msg.name} />
                    ))}
                  </datalist>

                  {existingMessages.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {existingMessages.map((msg) => (
                        <button
                          key={msg.id}
                          type="button"
                          onClick={() => setMessageName(msg.name)}
                          className={[
                            'rounded-lg px-2 py-1 text-xs font-medium transition',
                            messageName === msg.name
                              ? 'bg-blue-600 text-white'
                              : 'border border-slate-200 bg-white text-slate-600 hover:border-blue-300',
                          ].join(' ')}
                        >
                          {msg.name}
                        </button>
                      ))}
                    </div>
                  )}

                  {messageName.trim() && messageName.trim() !== currentRef && (
                    <div className="mt-3 rounded-lg border border-slate-200 bg-white p-2">
                      <div className="mb-1 text-xs text-slate-400">Будет записано в XML:</div>
                      <div className="break-all font-mono text-xs text-slate-600">
                        {`<message id="Message_${messageName.trim().replace(/[^a-zA-Z0-9]/g, '_')}" name="${messageName.trim()}"/>`}
                      </div>
                      <div className="mt-0.5 break-all font-mono text-xs text-slate-600">
                        {isThrow ? `<intermediateThrowEvent ...>` : `<intermediateCatchEvent ...>`}
                      </div>
                      <div className="ml-2 break-all font-mono text-xs text-slate-600">
                        {`<messageEventDefinition messageRef="Message_${messageName.trim().replace(/[^a-zA-Z0-9]/g, '_')}"/>`}
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => void applyMessageRef(messageName)}
                    disabled={!messageName.trim() || messageName.trim() === currentRef}
                    className={[
                      'mt-3 w-full rounded-xl py-2 text-sm font-semibold transition',
                      messageName.trim() && messageName.trim() !== currentRef
                        ? 'bg-blue-600 text-white hover:bg-blue-700'
                        : 'cursor-not-allowed bg-slate-200 text-slate-400',
                    ].join(' ')}
                  >
                    {messageName.trim() === currentRef ? '✓ Уже применено' : 'Применить message'}
                  </button>
                </div>

                <div className="mt-3 rounded-lg bg-blue-100 px-3 py-2 text-xs text-blue-700 space-y-1">
                  {isThrow ? (
                    <>
                      <div className="font-semibold">Intermediate Throw → отправляет сообщение:</div>
                      <div>• Другой процесс с MessageStartEvent получит это сообщение</div>
                      <div>• Или IntermediateCatchEvent в том же/другом процессе</div>
                      <div>• Процесс продолжается сразу после отправки</div>
                    </>
                  ) : (
                    <>
                      <div className="font-semibold">Intermediate Catch → ждёт сообщение:</div>
                      <div>• Процесс останавливается и ждёт входящее сообщение</div>
                      <div>• Продолжится когда MessageThrowEvent отправит это сообщение</div>
                      <div>• Имя должно совпадать с именем у Throw события</div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        )
      })() : null}

      {(type === 'bpmn:StartEvent' || type === 'bpmn:EndEvent' || type === 'bpmn:BoundaryEvent') ? (
        <div>
          <div className="text-sm font-semibold">
            {type === 'bpmn:StartEvent' ? 'Start Event' : type === 'bpmn:EndEvent' ? 'End Event' : 'Boundary Event'}
          </div>
          <div className="mt-2 text-xs text-slate-500">ID: {businessObject.id}</div>

          <div className="mt-4 text-sm font-medium">Название</div>
          <input
            value={name}
            onChange={(e) => updateName(e.target.value)}
            className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />

          {renderEventDefinitionPanel()}

          {(type === 'bpmn:StartEvent' || type === 'bpmn:EndEvent') && isMessageEvent(businessObject) ? (
            <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 p-4">
              <div className="text-sm font-semibold text-blue-900">Message настройка</div>
              <div className="mt-1 text-xs text-blue-600">
                Message связывает события между процессами. Одно и то же имя = одно сообщение.
              </div>

              <div className="mt-3 text-sm font-medium text-slate-700">Имя сообщения</div>
              <input
                list="existing-messages"
                value={messageName}
                onChange={(e) => setMessageName(e.target.value)}
                placeholder="например: startTest, orderCreated"
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              />
              <datalist id="existing-messages">
                {existingMessages.map((msg) => (
                  <option key={msg.id} value={msg.name} />
                ))}
              </datalist>

              {existingMessages.length > 0 ? (
                <div className="mt-2">
                  <div className="text-xs text-slate-500">Объявлены в схеме:</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {existingMessages.map((msg) => (
                      <button
                        key={msg.id}
                        type="button"
                        onClick={() => setMessageName(msg.name)}
                        className={[
                          'rounded-lg px-2 py-1 text-xs font-medium transition',
                          messageName === msg.name
                            ? 'bg-blue-600 text-white'
                            : 'border border-slate-200 bg-white text-slate-600 hover:border-blue-300',
                        ].join(' ')}
                      >
                        {msg.name}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {messageName.trim() ? (
                <div className="mt-3 rounded-lg bg-white p-2">
                  <div className="text-xs text-slate-400">В XML будет добавлено:</div>
                  <div className="mt-1 font-mono text-xs text-slate-700">{`<message id="${messageName.trim()}" name="msg_${messageName.trim()}"/>`}</div>
                  <div className="mt-1 font-mono text-xs text-slate-700">{`messageRef="${messageName.trim()}"`}</div>
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => void applyMessageRef(messageName)}
                disabled={!messageName.trim()}
                className={[
                  'mt-3 w-full rounded-xl py-2 text-sm font-semibold transition',
                  messageName.trim() ? 'bg-blue-600 text-white hover:bg-blue-700' : 'cursor-not-allowed bg-slate-200 text-slate-400',
                ].join(' ')}
              >
                Применить message
              </button>
            </div>
          ) : null}

          <div className="mt-4 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
            <span className="text-sm text-slate-600">Тип события</span>
            <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-700">
              {getEventDefinitionType(businessObject)}
            </span>
          </div>

          {type === 'bpmn:BoundaryEvent' ? (
            <div className="mt-3 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
              <span className="text-sm text-slate-600">cancelActivity</span>
              <span className="text-xs font-semibold text-slate-700">
                {businessObject.cancelActivity !== false ? 'true (прерывающий)' : 'false (не прерывающий)'}
              </span>
            </div>
          ) : null}
        </div>
      ) : type === 'bpmn:UserTask' ? (
        <div>
          <div className="text-sm font-semibold">UserTask</div>
          <div className="mt-3 text-xs text-slate-500">ID: {businessObject.id}</div>

          <div className="mt-4 text-sm font-medium">Название</div>
          <input
            value={name}
            onChange={(e) => updateName(e.target.value)}
            className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />

          <div className="mt-4 text-sm font-medium">Роль (assignee)</div>
          <select
            value={assignee}
            onChange={(e) => void updateAssignee(e.target.value)}
            className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            <option value="">— не задано —</option>
            {availableRoles.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>

          {schema && assignee ? (() => {
            const schemaRole = schema.roles.find((role) => role.role_name === assignee)
            if (!schemaRole) return null

            return (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-sm font-medium text-slate-700">Переменные роли</div>
                <div className="mt-2 text-xs text-slate-500">Вводит на этом шаге:</div>
                <div className="mt-2 space-y-1">
                  {schemaRole.variables.map((variable) => (
                    <div key={variable.id} className="flex items-center justify-between rounded-lg bg-white px-3 py-2">
                      <div>
                        <span className="text-xs font-mono font-semibold text-slate-700">{variable.name}</span>
                        <span className="ml-2 text-xs text-slate-500">{variable.label}</span>
                      </div>
                      <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] text-slate-600">{variable.type}</span>
                    </div>
                  ))}
                </div>
                {schemaRole.variables.length > 0 ? (
                  <div className="mt-2 text-xs text-slate-400">
                    Видят: {[...new Set(schemaRole.variables.flatMap((variable) => variable.readable_by_roles))].join(', ') || '—'}
                  </div>
                ) : null}
              </div>
            )
          })() : null}

          <div className="mt-3 text-xs text-slate-500">В XML будет записано:</div>
          <div className="mt-1 rounded-md bg-slate-50 px-3 py-2 text-xs font-mono text-slate-700">flowable:assignee="{assignee || ''}"</div>
        </div>
      ) : type === 'bpmn:ServiceTask' ? (
        <div>
          <div className="text-sm font-semibold">Service Task</div>
          <div className="mt-2 text-xs text-slate-500">ID: {businessObject.id}</div>

          <div className="mt-4 text-sm font-medium">Название</div>
          <input
            value={name}
            onChange={(e) => updateName(e.target.value)}
            className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />

          <div className="mt-4 text-sm font-medium">Тип реализации</div>
          <select
            value={serviceTaskType}
            onChange={(e) => void handleServiceTaskTypeChange(e.target.value as ServiceTaskType)}
            className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            {Object.entries(SERVICE_TASK_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>

          <div className="mt-3 text-sm font-medium">{SERVICE_TASK_ATTRS[serviceTaskType]}</div>
          {serviceTaskType === 'startByMessage' ? (
            <>
              <div className="mt-4 text-sm font-medium">Имя сообщения (message name)</div>
              <input
                value={messageNameForProcess}
                onChange={(e) => setMessageNameForProcess(e.target.value)}
                placeholder="startTest"
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
              <div className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-xs font-mono text-slate-500">
                {`\${runtimeService.startProcessInstanceByMessage('${messageNameForProcess || 'VALUE'}')}`}
              </div>
              <button
                type="button"
                onClick={() => void updateStartByMessage(messageNameForProcess)}
                disabled={!messageNameForProcess.trim()}
                className={[
                  'mt-3 w-full rounded-xl py-2 text-sm font-semibold transition',
                  messageNameForProcess.trim()
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'cursor-not-allowed bg-slate-200 text-slate-400',
                ].join(' ')}
              >
                Применить
              </button>
            </>
          ) : (
            <input
              value={serviceTaskValue}
              onChange={(e) => setServiceTaskValue(e.target.value)}
              onBlur={(e) => void updateServiceTask(serviceTaskType, e.target.value)}
              placeholder={
                serviceTaskType === 'class'
                  ? 'com.example.MyDelegate'
                  : serviceTaskType === 'expression'
                    ? '${myBean.execute(task)}'
                    : '${myDelegateBean}'
              }
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono"
            />
          )}
        </div>
      ) : type === 'bpmn:SequenceFlow' ? (
        <div>
          <div className="text-sm font-semibold">Условие перехода</div>

          <div className="mt-4 text-sm font-medium">Левый операнд</div>
          <input
            list="vars-list-left"
            value={leftOperand}
            onChange={(e) => setLeftOperand(e.target.value)}
            placeholder="priceCeo"
            className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          />
          <datalist id="vars-list-left">
            {availableVars.map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>

          <div className="mt-4 text-sm font-medium">Оператор</div>
          <select
            value={operator}
            onChange={(e) => setOperator(e.target.value as (typeof OPERATORS)[number]['value'])}
            className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            {OPERATORS.map((op) => (
              <option key={op.value} value={op.value}>
                {op.label}
              </option>
            ))}
          </select>

          <div className="mt-4 text-sm font-medium">Правый операнд</div>
          <div className="mt-2 flex gap-4">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                checked={rightType === 'variable'}
                onChange={() => {
                  setRightType('variable')
                  setRightOperand('')
                }}
              />
              Переменная
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                checked={rightType === 'constant'}
                onChange={() => {
                  setRightType('constant')
                  setRightOperand('')
                }}
              />
              Константа
            </label>
          </div>

          {rightType === 'variable' ? (
            <>
              <input
                list="vars-list-right"
                value={rightOperand}
                onChange={(e) => setRightOperand(e.target.value)}
                placeholder="priceManager"
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              />
              <datalist id="vars-list-right">
                {availableVars.map((v) => (
                  <option key={v} value={v} />
                ))}
              </datalist>
            </>
          ) : (
            <input
              value={rightOperand}
              onChange={(e) => setRightOperand(e.target.value)}
              placeholder="например: 100000, true, 'текст'"
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            />
          )}

          <div className="mt-4 text-sm font-medium">conditionExpression</div>
          <div className="mt-2 min-h-[36px] rounded-md bg-slate-50 px-3 py-2 text-xs font-mono text-slate-700">
            {buildExpression() || <span className="text-slate-400">заполните поля выше</span>}
          </div>
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => {
                const expression = buildExpression()
                if (!expression) return
                updateCondition(expression)
              }}
              disabled={!leftOperand.trim() || !rightOperand.trim()}
              className={[
                'rounded-2xl px-4 py-2 text-sm font-semibold',
                leftOperand.trim() && rightOperand.trim() ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-500 cursor-not-allowed',
              ].join(' ')}
            >
              Применить
            </button>
          </div>
        </div>
      ) : type === 'bpmn:ExclusiveGateway' ? (
        <div>
          <div className="text-sm font-semibold">Exclusive Gateway</div>
          <div className="mt-2 text-xs text-slate-500">ID: {businessObject.id}</div>
          <div className="mt-4 text-sm text-slate-700">Исходящие стрелки:</div>
          <ul className="mt-2 list-disc pl-5 text-sm text-slate-600">
            {(element.outgoing || []).map((flow: any) => (
              <li key={flow.id}>{flow.id}</li>
            ))}
          </ul>
        </div>
      ) : type === 'bpmn:ParallelGateway' ? (
        <div>
          <div className="text-sm font-semibold">Parallel Gateway</div>
          <div className="mt-2 text-xs text-slate-500">ID: {businessObject.id}</div>

          <div className="mt-4 text-sm font-medium">Название</div>
          <input
            value={name}
            onChange={(e) => updateName(e.target.value)}
            className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />

          <div className="mt-4 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">
            Условия на Parallel Gateway не нужны.
          </div>
        </div>
      ) : type === 'bpmn:SubProcess' ? (
        <div>
          <div className="text-sm font-semibold">SubProcess</div>
          <div className="mt-2 text-xs text-slate-500">ID: {businessObject.id}</div>

          <div className="mt-4 text-sm font-medium">Название</div>
          <input
            value={name}
            onChange={(e) => updateName(e.target.value)}
            className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
        </div>
      ) : type === 'bpmn:CallActivity' ? (
        <div>
          <div className="text-sm font-semibold">Call Activity</div>
          <div className="mt-2 text-xs text-slate-500">ID: {businessObject.id}</div>

          <div className="mt-4 text-sm font-medium">Название</div>
          <input
            value={name}
            onChange={(e) => updateName(e.target.value)}
            className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />

          <div className="mt-4 text-sm font-medium">Процесс (из задеплоенных)</div>
          <select
            value={calledElement}
            onChange={(e) => setCalledElement(e.target.value)}
            className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            <option value="">— выбрать —</option>
            {availableProcessKeys.map((item) => (
              <option key={item.key} value={item.key}>{item.name} ({item.key})</option>
            ))}
          </select>

          <div className="mt-4 text-sm font-medium">calledElement</div>
          <input
            value={calledElement}
            onChange={(e) => setCalledElement(e.target.value)}
            placeholder="processDefinitionKey"
            className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />

          <div className="mt-4 text-sm font-medium">Тип calledElement</div>
          <div className="mt-2 flex gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={calledElementType === 'key'}
                onChange={() => setCalledElementType('key')}
              />
              key (по умолчанию)
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={calledElementType === 'id'}
                onChange={() => setCalledElementType('id')}
              />
              id
            </label>
          </div>

          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="text-sm font-semibold text-slate-700">Опции Flowable</div>
            <div className="mt-3 grid grid-cols-1 gap-2 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={inheritVariables} onChange={(e) => setInheritVariables(e.target.checked)} />
                inheritVariables
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={inheritBusinessKey} onChange={(e) => setInheritBusinessKey(e.target.checked)} />
                inheritBusinessKey
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={sameDeployment} onChange={(e) => setSameDeployment(e.target.checked)} />
                sameDeployment
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={asyncComplete} onChange={(e) => setAsyncComplete(e.target.checked)} />
                asyncComplete
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={fallbackToDefaultTenant} onChange={(e) => setFallbackToDefaultTenant(e.target.checked)} />
                fallbackToDefaultTenant
              </label>
            </div>

            <div className="mt-3 text-sm font-medium">businessKey (expression)</div>
            <input
              value={businessKey}
              onChange={(e) => setBusinessKey(e.target.value)}
              placeholder="например: ${execution.processBusinessKey}"
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-mono"
            />
          </div>

          <div className="mt-4 rounded-xl border border-slate-200 p-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-700">Входные переменные (flowable:in)</div>
              <button
                type="button"
                onClick={() => addCallMapping('in')}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:border-slate-300"
              >
                + Добавить
              </button>
            </div>

            <div className="mt-3 space-y-2">
              {inVariables.length === 0 ? <div className="text-xs text-slate-500">Нет маппингов</div> : null}
              {inVariables.map((mapping) => (
                <div key={mapping.id} className="rounded-xl border border-slate-200 bg-slate-50 p-2">
                  <label className="mb-2 flex items-center gap-2 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      checked={mapping.isExpression}
                      onChange={(e) => updateCallMapping('in', mapping.id, { isExpression: e.target.checked })}
                    />
                    sourceExpression
                  </label>
                  <div className="grid grid-cols-1 gap-2">
                    <input
                      list="call-vars-list"
                      value={mapping.source}
                      onChange={(e) => updateCallMapping('in', mapping.id, { source: e.target.value })}
                      placeholder={mapping.isExpression ? '${myExpr}' : 'source'}
                      className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm"
                    />
                    <input
                      value={mapping.target}
                      onChange={(e) => updateCallMapping('in', mapping.id, { target: e.target.value })}
                      placeholder="target"
                      className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeCallMapping('in', mapping.id)}
                    className="mt-2 text-xs font-semibold text-rose-600 hover:text-rose-700"
                  >
                    Удалить
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-slate-200 p-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-700">Выходные переменные (flowable:out)</div>
              <button
                type="button"
                onClick={() => addCallMapping('out')}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:border-slate-300"
              >
                + Добавить
              </button>
            </div>

            <div className="mt-3 space-y-2">
              {outVariables.length === 0 ? <div className="text-xs text-slate-500">Нет маппингов</div> : null}
              {outVariables.map((mapping) => (
                <div key={mapping.id} className="rounded-xl border border-slate-200 bg-slate-50 p-2">
                  <label className="mb-2 flex items-center gap-2 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      checked={mapping.isExpression}
                      onChange={(e) => updateCallMapping('out', mapping.id, { isExpression: e.target.checked })}
                    />
                    sourceExpression
                  </label>
                  <div className="grid grid-cols-1 gap-2">
                    <input
                      list="call-vars-list"
                      value={mapping.source}
                      onChange={(e) => updateCallMapping('out', mapping.id, { source: e.target.value })}
                      placeholder={mapping.isExpression ? '${myExpr}' : 'source'}
                      className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm"
                    />
                    <input
                      value={mapping.target}
                      onChange={(e) => updateCallMapping('out', mapping.id, { target: e.target.value })}
                      placeholder="target"
                      className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeCallMapping('out', mapping.id)}
                    className="mt-2 text-xs font-semibold text-rose-600 hover:text-rose-700"
                  >
                    Удалить
                  </button>
                </div>
              ))}
            </div>
          </div>

          <datalist id="call-vars-list">
            {availableVars.map((variable) => (
              <option key={variable} value={variable} />
            ))}
          </datalist>

          <button
            type="button"
            onClick={() => void applyCallActivity()}
            className="mt-4 w-full rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Применить настройки Call Activity
          </button>
        </div>
      ) : (
        <div>
          <div className="text-sm font-semibold">Элемент</div>
          <div className="mt-2 text-xs text-slate-500">ID: {businessObject.id}</div>
          <div className="mt-2 text-xs text-slate-500">Name: {businessObject.name ?? '-'}</div>
        </div>
      )}
    </div>
  )
}

export default BpmnPropertiesPanel
