import { useEffect, useRef } from 'react'
import NavigatedViewer from 'bpmn-js/lib/NavigatedViewer'

import 'bpmn-js/dist/assets/diagram-js.css'
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn-embedded.css'

type ViewerInstance = InstanceType<typeof NavigatedViewer>

interface MigrationDiagramViewerProps {
  xml: string
  markers?: Record<string, string[]>
  interactive?: boolean
  onElementClick?: (elementId: string, elementType: string) => void
  emptyLabel?: string
}

const interactiveTypePattern = /(Task|Gateway)$/

function isValidBpmnXml(xml: string): boolean {
  return xml.trim().length > 0 && xml.includes('<') && xml.includes('bpmn')
}

export function MigrationDiagramViewer({ xml, markers, interactive = false, onElementClick, emptyLabel = 'Диаграмма не загружена' }: MigrationDiagramViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const viewerRef = useRef<ViewerInstance | null>(null)
  const importedXmlRef = useRef<string>('')
  const appliedMarkersRef = useRef<string[]>([])

  useEffect(() => {
    if (!containerRef.current) {
      return
    }

    const viewer = new NavigatedViewer({ container: containerRef.current }) as ViewerInstance
    viewerRef.current = viewer

    if (interactive && onElementClick) {
      const eventBus = viewer.get('eventBus') as {
        on: (eventName: string, handler: (event: { element?: { id?: string; businessObject?: { $type?: string } } }) => void) => void
      }

      eventBus.on('element.click', (event) => {
        const element = event.element
        const elementId = element?.id
        const elementType = element?.businessObject?.$type ?? ''
        if (elementId && interactiveTypePattern.test(elementType)) {
          onElementClick(elementId, elementType)
        }
      })
    }

    return () => {
      viewer.destroy()
      viewerRef.current = null
      importedXmlRef.current = ''
      appliedMarkersRef.current = []
    }
  }, [interactive, onElementClick])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer || !isValidBpmnXml(xml)) {
      return
    }

    let cancelled = false

    const render = async () => {
      try {
        if (xml !== importedXmlRef.current) {
          await viewer.importXML(xml)
          if (cancelled) {
            return
          }

          importedXmlRef.current = xml
          const canvas = viewer.get('canvas') as { zoom: (mode: string) => void }
          canvas.zoom('fit-viewport')
        }

        if (cancelled) {
          return
        }

        const canvas = viewer.get('canvas') as {
          addMarker: (id: string, marker: string) => void
          removeMarker: (id: string, marker: string) => void
        }

        appliedMarkersRef.current.forEach((entry) => {
          const [elementId, marker] = entry.split('::')
          canvas.removeMarker(elementId, marker)
        })
        appliedMarkersRef.current = []

        Object.entries(markers ?? {}).forEach(([elementId, classes]) => {
          classes.forEach((marker) => {
            canvas.addMarker(elementId, marker)
            appliedMarkersRef.current.push(`${elementId}::${marker}`)
          })
        })
      } catch {
        if (!cancelled) {
          // Ignore render errors here; the surrounding modal shows the actionable state.
        }
      }
    }

    void render()

    return () => {
      cancelled = true
    }
  }, [markers, xml])

  return (
    <div className="relative h-full min-h-[18rem] w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
      {!isValidBpmnXml(xml) ? (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">{emptyLabel}</div>
      ) : null}
      <div ref={containerRef} className="h-full w-full" />
    </div>
  )
}