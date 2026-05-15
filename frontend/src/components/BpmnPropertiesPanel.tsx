import { useEffect, useMemo, useState } from 'react'
import type { ProcessSchemaRead } from '../types/api'

interface BpmnPropertiesPanelProps {
  element: any | null
  availableRoles: string[]
  modeler: any | null
  onXmlChange?: (xml: string) => void
  schema: ProcessSchemaRead | null
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

export function BpmnPropertiesPanel({ element, availableRoles, modeler, onXmlChange, schema }: BpmnPropertiesPanelProps) {
  const businessObject = element?.businessObject ?? null
  const type = businessObject?.$type ?? null

  // UserTask state
  const [name, setName] = useState('')
  const [assignee, setAssignee] = useState('')

  // SequenceFlow condition state
  const [variable, setVariable] = useState('')
  const [value, setValue] = useState<'true' | 'false'>('true')

  // Compute approval variables from diagram
  const approvalVars = useMemo<string[]>(() => {
    if (!modeler) return [] as string[]
    try {
      const elementRegistry = modeler.get('elementRegistry')
      const all = elementRegistry.getAll() || []
      const roles = all
        .filter((el: any) => el.type === 'bpmn:UserTask')
        .map((el: any) => el.businessObject?.['flowable:assignee'] ?? el.businessObject?.assignee)
        .filter(Boolean)
        .map((r: string) => `${r}Approved`)
      return Array.from(new Set(roles))
    } catch (e) {
      return []
    }
  }, [modeler])

  useEffect(() => {
    if (!businessObject) return

    if (type === 'bpmn:UserTask') {
      setName(businessObject.name ?? '')
      const attrs = businessObject.$attrs || {}
      setAssignee(attrs['flowable:assignee'] ?? businessObject.assignee ?? '')
    }

    if (type === 'bpmn:SequenceFlow') {
      const currentCondition = businessObject?.conditionExpression?.body ?? ''
      const match = currentCondition.match(/\$\{(\w+)\s*==\s*(true|false)\}/)
      if (match) {
        setVariable(match[1])
        setValue(match[2] as 'true' | 'false')
      } else {
        setVariable('')
        setValue('true')
      }
    }
  }, [businessObject, type])

  const updateUserTaskName = (nextName: string) => {
    if (!modeler || !element) return
    try {
      const modeling = modeler.get('modeling')
      modeling.updateProperties(element, { name: nextName })
      setName(nextName)
    } catch (e) {
      console.error('updateUserTaskName error', e)
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

  const updateCondition = (variableName: string, variableValue: 'true' | 'false') => {
    if (!modeler || !element) return
    try {
      const bo = element.businessObject
      const modeling = modeler.get('modeling')
      const moddle = modeler.get('moddle')
      const body = '${' + variableName + ' == ' + variableValue + '}'
      const conditionExpression = moddle.create('bpmn:FormalExpression', { body })
      modeling.updateProperties(element, { conditionExpression })
      // Уведомляем modeler об изменении
      modeler.get('eventBus').fire('elements.changed', { elements: [element] })
      setVariable(variableName)
      setValue(variableValue)
    } catch (e) {
      console.error('updateCondition error', e)
    }
  }

  if (!businessObject) {
    return <div className="p-4 text-sm text-slate-500">Элемент не выбран</div>
  }

  // Render
  return (
    <div className="p-4">
      {type === 'bpmn:UserTask' ? (
        <div>
          <div className="text-sm font-semibold">UserTask</div>
          <div className="mt-3 text-xs text-slate-500">ID: {businessObject.id}</div>

          <div className="mt-4 text-sm font-medium">Название</div>
          <input
            value={name}
            onChange={(e) => updateUserTaskName(e.target.value)}
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
      ) : type === 'bpmn:SequenceFlow' ? (
        <div>
          <div className="text-sm font-semibold">Условие перехода</div>

          <div className="mt-4 text-sm font-medium">Переменная</div>
          <input
            list="approvalVarsList"
            value={variable}
            onChange={(e) => setVariable(e.target.value)}
            placeholder="Введите или выберите переменную (e.g. managerApproved)"
            className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          />
          <datalist id="approvalVarsList">
            {approvalVars.map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>

          <div className="mt-4 text-sm font-medium">Значение</div>
          <select value={value} onChange={(e) => setValue(e.target.value as 'true' | 'false')} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
            <option value="true">true</option>
            <option value="false">false</option>
          </select>

          <div className="mt-4 text-sm font-medium">conditionExpression</div>
          <div className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-xs font-mono text-slate-700">{variable ? `\${${variable} == ${value}}` : ''}</div>
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => variable && updateCondition(variable.trim(), value)}
              disabled={!variable.trim()}
              className={[
                'rounded-2xl px-4 py-2 text-sm font-semibold',
                variable.trim() ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-500 cursor-not-allowed',
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
