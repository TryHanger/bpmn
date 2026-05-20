import { useEffect, useRef } from 'react'
import BpmnModeler from 'bpmn-js/lib/Modeler'
import NavigatedViewer from 'bpmn-js/lib/NavigatedViewer'

import 'bpmn-js/dist/assets/diagram-js.css'
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn-embedded.css'

interface BpmnEditorProps {
  xml: string
  onChange?: (xml: string) => void
  readonly?: boolean
  onModelerReady?: (modeler: any) => void
  onElementSelect?: (element: any | null) => void
}

type DiagramInstance = any

const isValidBpmnXml = (xml: string): boolean => {
  return xml.trim().length > 0 && xml.includes('<') && xml.includes('bpmn')
}

export function BpmnEditor({ xml, onChange, readonly = false, onModelerReady, onElementSelect }: BpmnEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const modelerRef = useRef<DiagramInstance | null>(null)
  const lastImportedXml = useRef<string>('')
  const isInternalChange = useRef(false)
  const destroyedRef = useRef(false)
  const initializedRef = useRef(false)

  // Эффект 1: создаём/пересоздаём инстанс при смене readonly
  useEffect(() => {
    if (!containerRef.current) return

    // Уничтожаем предыдущий инстанс и сбрасываем флаги
    modelerRef.current?.destroy()
    modelerRef.current = null
    lastImportedXml.current = ''
    destroyedRef.current = false
    initializedRef.current = false

    // Создаём нужный тип: Modeler для редактирования, NavigatedViewer для просмотра
    const ModelerClass = readonly ? NavigatedViewer : BpmnModeler
    const modeler = new ModelerClass({ container: containerRef.current })
    modelerRef.current = modeler
    // notify parent that modeler is ready
    ;(onModelerReady as any)?.(modeler)

    const resizeCanvas = () => {
      try {
        modelerRef.current?.get('canvas')?.resizeTo?.()
      } catch (e) {
        // ignore resize errors while the canvas is initializing
      }
    }

    const resizeObserver = new ResizeObserver(() => {
      resizeCanvas()
    })

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current)
    }

    const load = async () => {
      // Защита: не загружаем пустой или невалидный XML
      if (!isValidBpmnXml(xml)) {
        console.warn('BpmnEditor: xml is empty or invalid, skipping importXML', { xmlLength: xml?.length })
        return
      }

      try {
        await modeler.importXML(xml)
        lastImportedXml.current = xml
        initializedRef.current = true
        resizeCanvas()

        // Подписываемся на изменения только в режиме редактирования
        if (!readonly) {
          modeler.on('commandStack.changed', async () => {
            if (destroyedRef.current) return
            isInternalChange.current = true
            try {
              const { xml: updatedXml } = await modeler.saveXML({ format: true })
              lastImportedXml.current = updatedXml
              onChange?.(updatedXml)
            } catch (e) {
              console.error('saveXML error:', e)
            } finally {
              setTimeout(() => {
                isInternalChange.current = false
              }, 0)
            }
          })
        }

        // Подписываемся на выбор элемента в любой режим
        modeler.on && modeler.on('selection.changed', (event: any) => {
          try {
            const newSelection = event?.newSelection ?? []
            const el = newSelection[0] ?? null
            onElementSelect?.(el)
          } catch (e) {
            console.error('selection.changed handler error', e)
          }
        })
      } catch (err) {
        console.error('BpmnEditor importXML error:', err)
      }
    }

    load()

    return () => {
      resizeObserver.disconnect()
      destroyedRef.current = true
      modeler.destroy()
      modelerRef.current = null
    }
  }, [readonly])

  // Эффект 2: обновляем XML без пересоздания инстанса
  useEffect(() => {
    if (!modelerRef.current) return
    if (!initializedRef.current) return  // ← ждём завершения Эффекта 1
    if (!isValidBpmnXml(xml)) return
    if (xml === lastImportedXml.current) return
    if (isInternalChange.current) return

    const load = async () => {
      try {
        await modelerRef.current?.importXML(xml)
        lastImportedXml.current = xml
      } catch (err) {
        console.error('BpmnEditor xml update error:', err)
      }
    }

    load()
  }, [xml])

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      {!isValidBpmnXml(xml) && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#9ca3af',
            fontSize: '14px',
            backgroundColor: '#f9fafb',
          }}
        >
          Загрузка диаграммы...
        </div>
      )}
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  )
}