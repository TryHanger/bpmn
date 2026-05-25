import { useEffect, useRef } from 'react'
import NavigatedViewer from 'bpmn-js/lib/NavigatedViewer'

import type { ActivityStatus, ChildInstance } from '../types/api'

interface ProcessViewerProps {
  instanceId: string
  xmlTemplate: string
  activities: ActivityStatus[]
  childInstances: ChildInstance[]
}

type ViewerInstance = InstanceType<typeof NavigatedViewer>

const COLORS: Record<ActivityStatus['status'], { stroke: string; fill: string }> = {
  completed: { stroke: '#10B981', fill: '#ECFDF5' },
  active: { stroke: '#3B82F6', fill: '#EFF6FF' },
  pending: { stroke: '#9CA3AF', fill: '#F9FAFB' },
  skipped: { stroke: '#6B7280', fill: '#F3F4F6' },
  rejected: { stroke: '#EF4444', fill: '#FEF2F2' },
  interrupted: { stroke: '#F59E0B', fill: '#FFFBEB' },
}

function badgeText(activity: ActivityStatus): string {
  if (activity.status === 'completed') {
    return `✓ ${activity.assignee ?? ''}`.trim()
  }
  if (activity.status === 'active') {
    return `⏳ ${activity.assignee ?? ''}`.trim()
  }
  if (activity.status === 'skipped') {
    return '—'
  }
  if (activity.status === 'rejected') {
    return '✗'
  }
  if (activity.status === 'interrupted') {
    return '!' 
  }
  return activity.assignee ?? '•'
}

export function ProcessViewer({ instanceId, xmlTemplate, activities, childInstances }: ProcessViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const viewerRef = useRef<ViewerInstance | null>(null)

  const decorateViewer = (viewer: ViewerInstance) => {
    const canvas = viewer.get('canvas') as { setColor: (element: unknown, color: { stroke: string; fill: string }) => void }
    const overlays = viewer.get('overlays') as {
      clear: () => void
      add: (id: string, overlay: { position: { bottom: number; right: number }; html: string }) => void
    }
    const elementRegistry = viewer.get('elementRegistry') as { get: (id: string) => unknown }

    overlays.clear()

    activities.forEach((activity) => {
      const element = elementRegistry.get(activity.activityId)
      if (!element) {
        return
      }

      canvas.setColor(element, COLORS[activity.status])
      overlays.add(activity.activityId, {
        position: { bottom: -8, right: -8 },
        html: `<div class="rounded-full border px-2 py-1 text-[10px] font-semibold shadow-sm ${activity.status === 'active' ? 'border-blue-200 bg-blue-100 text-blue-700' : 'border-slate-200 bg-white text-slate-600'}">${badgeText(activity)}</div>`,
      })
    })

    childInstances.forEach((child, index) => {
      const element = elementRegistry.get(child.activityId)
      if (!element) {
        return
      }

      overlays.add(`${child.activityId}-${child.processInstanceId}`, {
        position: { bottom: -8 - index * 24, right: -8 },
        html:
          child.status === 'running'
            ? `<a href="/processes/${child.processInstanceId}" class="flex items-center gap-1 rounded-full border border-blue-300 bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-700 shadow-sm animate-pulse">⏳ subprocess</a>`
            : `<a href="/processes/${child.processInstanceId}" class="flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2 py-1 text-[10px] font-semibold text-green-700 shadow-sm">✓ subprocess</a>`,
      })
    })
  }

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    const viewer = new NavigatedViewer({ container }) as ViewerInstance
    viewerRef.current = viewer

    let cancelled = false
    void viewer
      .importXML(xmlTemplate)
      .then(() => {
        if (cancelled) {
          return
        }
        decorateViewer(viewer)
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
      viewer.destroy()
      viewerRef.current = null
    }
  }, [xmlTemplate, instanceId])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) {
      return
    }
    void viewer.importXML(xmlTemplate).then(() => {
      if (!viewerRef.current) {
        return
      }
      decorateViewer(viewer)
    })
  }, [activities, childInstances, xmlTemplate])

  return <div ref={containerRef} className="h-[720px] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-900/5" />
}
