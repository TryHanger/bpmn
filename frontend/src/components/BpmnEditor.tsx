import { useEffect, useRef } from 'react'
import BpmnModeler from 'bpmn-js/lib/Modeler'
import NavigatedViewer from 'bpmn-js/lib/NavigatedViewer'

import 'bpmn-js/dist/assets/diagram-js.css'
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn-embedded.css'

interface BpmnEditorProps {
  xml: string
  onChange?: (xml: string) => void
  readonly?: boolean
}

type DiagramInstance = any

const isValidBpmnXml = (xml: string): boolean => {
  return xml.trim().length > 0 && xml.includes('<') && xml.includes('bpmn')
}

export function BpmnEditor({ xml, onChange, readonly = false }: BpmnEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const modelerRef = useRef<DiagramInstance | null>(null)
  const lastImportedXml = useRef<string>('')
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

        // Подписываемся на изменения только в режиме редактирования
        if (!readonly) {
          modeler.on('commandStack.changed', async () => {
            if (destroyedRef.current) return
            try {
              const { xml: updatedXml } = await modeler.saveXML({ format: true })
              lastImportedXml.current = updatedXml
              onChange?.(updatedXml)
            } catch (e) {
              console.error('saveXML error:', e)
            }
          })
        }
      } catch (err) {
        console.error('BpmnEditor importXML error:', err)
      }
    }

    load()

    return () => {
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