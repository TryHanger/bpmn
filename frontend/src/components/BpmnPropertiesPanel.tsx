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

const OPERATORS = [
  { value: '==', label: '== (равно)' },
  { value: '!=', label: '!= (не равно)' },
  { value: '>', label: '>  (больше)' },
  { value: '>=', label: '>= (больше или равно)' },
  { value: '<', label: '<  (меньше)' },
  { value: '<=', label: '<= (меньше или равно)' },
] as const

export function BpmnPropertiesPanel({ element, availableRoles, modeler, onXmlChange, schema }: BpmnPropertiesPanelProps) {
  const businessObject = element?.businessObject ?? null
  const type = businessObject?.$type ?? null

  // UserTask state
  const [name, setName] = useState('')
  const [assignee, setAssignee] = useState('')

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

    if (type === 'bpmn:UserTask') {
      setName(businessObject.name ?? '')
      const attrs = businessObject.$attrs || {}
      setAssignee(attrs['flowable:assignee'] ?? businessObject.assignee ?? '')
    }

    if (type === 'bpmn:SequenceFlow') {
      const currentCondition = businessObject?.conditionExpression?.body ?? ''
      parseCondition(currentCondition)
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
