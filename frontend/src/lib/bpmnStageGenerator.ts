// ─── Public types ────────────────────────────────────────────────────────────

export interface StageUser {
  /** flowable:candidateGroups value */
  id: string
  /** Display label */
  label: string
}

export interface Subblock {
  id: string
  name: string
  users: StageUser[]
}

export interface Stage {
  id: string
  name: string
  deadline_hours: number
  mode: 'users' | 'subblocks'
  users: StageUser[]
  subblocks: Subblock[]
}

export interface ProcessTemplate {
  processId: string
  processName: string
  templateName: string
  stages: Stage[]
}

export interface ValidationError {
  field: string
  message: string
}

// ─── Validation ───────────────────────────────────────────────────────────────

const PROCESS_ID_RE = /^[a-zA-Z][a-zA-Z0-9_-]*$/

export function validateTemplate(tpl: ProcessTemplate): ValidationError[] {
  const errors: ValidationError[] = []

  if (!tpl.processId.trim()) {
    errors.push({ field: 'processId', message: 'Process ID обязателен' })
  } else if (!PROCESS_ID_RE.test(tpl.processId.trim())) {
    errors.push({ field: 'processId', message: 'Только латиница, цифры, _ и -. Первый символ — буква.' })
  }

  if (!tpl.processName.trim()) {
    errors.push({ field: 'processName', message: 'Название процесса обязательно' })
  }

  if (tpl.stages.length === 0) {
    errors.push({ field: 'stages', message: 'Добавьте хотя бы один блок' })
  }

  for (let i = 0; i < tpl.stages.length; i++) {
    const stage = tpl.stages[i]
    const stageLabel = `Блок ${i + 1}${stage.name ? ` «${stage.name}»` : ''}`

    if (!stage.name.trim()) {
      errors.push({ field: `stages[${i}].name`, message: `${stageLabel}: введите название` })
    }

    if (stage.mode === 'users') {
      if (stage.users.length === 0) {
        errors.push({ field: `stages[${i}].users`, message: `${stageLabel}: добавьте хотя бы одного исполнителя` })
      }
    } else {
      if (stage.subblocks.length === 0) {
        errors.push({ field: `stages[${i}].subblocks`, message: `${stageLabel}: добавьте хотя бы один подблок` })
      }
      for (let j = 0; j < stage.subblocks.length; j++) {
        const sb = stage.subblocks[j]
        const sbLabel = `${stageLabel}, подблок ${j + 1}${sb.name ? ` «${sb.name}»` : ''}`
        if (!sb.name.trim()) {
          errors.push({ field: `stages[${i}].subblocks[${j}].name`, message: `${sbLabel}: введите название` })
        }
        if (sb.users.length === 0) {
          errors.push({ field: `stages[${i}].subblocks[${j}].users`, message: `${sbLabel}: добавьте хотя бы одного исполнителя` })
        }
      }
    }
  }

  return errors
}

// ─── BPMN generator internals ────────────────────────────────────────────────

// Element dimensions
const TW = 100, TH = 80   // userTask
const GW = 50,  GH = 50   // gateway
const EW = 36,  EH = 36   // start/end event

// Spacing
const VGAP  = 70   // vertical gap between stage groups
const IGAP  = 40   // inner vertical gap (gw → tasks → gw)
const OR_COL = 140  // horizontal step between OR-parallel user tasks

type ElType = 'startEvent' | 'endEvent' | 'userTask' | 'inclusiveGateway' | 'parallelGateway'

interface El {
  id: string
  type: ElType
  name: string
  cg: string   // candidateGroups
  x: number
  y: number
  w: number
  h: number
}

interface Flow {
  id: string
  src: string
  tgt: string
}

interface BlockResult {
  els: El[]
  flows: Flow[]
  topIds: string[]   // IDs of entry elements (where incoming flows should connect)
  botIds: string[]   // IDs of exit elements (where outgoing flows should originate)
  botY: number       // Y below the last element
}

let _cnt = 0
const uid = (p: string) => `${p}_${++_cnt}`

function mkTask(name: string, cg: string, x: number, y: number): El {
  return { id: uid('ut'), type: 'userTask', name, cg, x, y, w: TW, h: TH }
}
function mkGw(type: 'inclusiveGateway' | 'parallelGateway', cx: number, y: number): El {
  const prefix = type === 'inclusiveGateway' ? 'iGW' : 'pGW'
  return { id: uid(prefix), type, name: '', cg: '', x: cx - GW / 2, y, w: GW, h: GH }
}

// Build an OR block: either 1 task or inclGW → N tasks → inclGW
function usersBlock(users: StageUser[], cx: number, topY: number): BlockResult {
  if (users.length === 0) {
    // Shouldn't happen after validation — create a placeholder
    const el = mkTask('(пусто)', '', cx - TW / 2, topY)
    return { els: [el], flows: [], topIds: [el.id], botIds: [el.id], botY: topY + TH }
  }

  if (users.length === 1) {
    const el = mkTask(users[0].label || users[0].id, users[0].id, cx - TW / 2, topY)
    return { els: [el], flows: [], topIds: [el.id], botIds: [el.id], botY: topY + TH }
  }

  // Multiple users → Inclusive Gateway (OR)
  const n = users.length
  const totalW = (n - 1) * OR_COL
  const leftCX = cx - totalW / 2

  const split = mkGw('inclusiveGateway', cx, topY)
  const taskY = topY + GH + IGAP
  const tasks: El[] = []
  const flows: Flow[] = []

  for (let i = 0; i < n; i++) {
    const u = users[i]
    const tx = leftCX + i * OR_COL - TW / 2
    const task = mkTask(u.label || u.id, u.id, tx, taskY)
    tasks.push(task)
    flows.push({ id: uid('f'), src: split.id, tgt: task.id })
  }

  const joinY = taskY + TH + IGAP
  const join = mkGw('inclusiveGateway', cx, joinY)

  for (const t of tasks) {
    flows.push({ id: uid('f'), src: t.id, tgt: join.id })
  }

  return {
    els: [split, ...tasks, join],
    flows,
    topIds: [split.id],
    botIds: [join.id],
    botY: joinY + GH,
  }
}

// Build the block for one Stage
function stageBlock(stage: Stage, cx: number, topY: number): BlockResult {
  // Determine whether to use parallel layout
  const isParallel = stage.mode === 'subblocks' && stage.subblocks.length > 1

  if (!isParallel) {
    // Edge case: single subblock → treat as users mode
    const users =
      stage.mode === 'subblocks' && stage.subblocks.length === 1
        ? stage.subblocks[0].users
        : stage.users
    return usersBlock(users, cx, topY)
  }

  // ── Parallel subblocks ────────────────────────────────────────────────────
  const sbs = stage.subblocks
  const n = sbs.length

  // Column width = enough to hold the widest OR block + spacing
  const maxU = Math.max(...sbs.map(sb => sb.users.length))
  const colW = maxU > 1 ? (maxU - 1) * OR_COL + TW + 60 : TW + 80

  const totalW = (n - 1) * colW
  const leftCX = cx - totalW / 2

  const split = mkGw('parallelGateway', cx, topY)
  const sbTopY = topY + GH + IGAP

  const allEls: El[] = [split]
  const allFlows: Flow[] = []
  const sbResults: BlockResult[] = []

  for (let i = 0; i < n; i++) {
    const sbCX = leftCX + i * colW
    const r = usersBlock(sbs[i].users, sbCX, sbTopY)
    sbResults.push(r)
    allEls.push(...r.els)
    allFlows.push(...r.flows)
    for (const tid of r.topIds) allFlows.push({ id: uid('f'), src: split.id, tgt: tid })
  }

  const maxBotY = Math.max(...sbResults.map(r => r.botY))
  const joinY = maxBotY + IGAP
  const join = mkGw('parallelGateway', cx, joinY)
  allEls.push(join)

  for (const r of sbResults) {
    for (const bid of r.botIds) allFlows.push({ id: uid('f'), src: bid, tgt: join.id })
  }

  return {
    els: allEls,
    flows: allFlows,
    topIds: [split.id],
    botIds: [join.id],
    botY: joinY + GH,
  }
}

// ─── XML serialiser ───────────────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function buildXml(els: El[], flows: Flow[], tpl: ProcessTemplate): string {
  const elMap = new Map(els.map(e => [e.id, e]))

  const processBody = [
    ...els.map(e => {
      if (e.type === 'startEvent')      return `    <startEvent id="${e.id}" name="${esc(e.name)}"/>`
      if (e.type === 'endEvent')        return `    <endEvent id="${e.id}" name="${esc(e.name)}"/>`
      if (e.type === 'userTask')        return `    <userTask id="${e.id}" name="${esc(e.name)}" flowable:candidateGroups="${esc(e.cg)}"/>`
      if (e.type === 'inclusiveGateway') return `    <inclusiveGateway id="${e.id}" name=""/>`
      return `    <parallelGateway id="${e.id}" name=""/>`
    }),
    ...flows.map(f => `    <sequenceFlow id="${f.id}" sourceRef="${f.src}" targetRef="${f.tgt}"/>`),
  ].join('\n')

  const shapes = els.map(e => `
      <bpmndi:BPMNShape id="${e.id}_di" bpmnElement="${e.id}">
        <omgdc:Bounds x="${Math.round(e.x)}" y="${Math.round(e.y)}" width="${e.w}" height="${e.h}"/>
      </bpmndi:BPMNShape>`).join('')

  const edges = flows.map(f => {
    const s = elMap.get(f.src), t = elMap.get(f.tgt)
    if (!s || !t) return ''
    const sx = s.x + s.w / 2, sy = s.y + s.h
    const tx = t.x + t.w / 2, ty = t.y
    let pts: string
    if (Math.abs(sx - tx) < 2) {
      pts = `<omgdi:waypoint x="${Math.round(sx)}" y="${Math.round(sy)}"/>` +
            `<omgdi:waypoint x="${Math.round(tx)}" y="${Math.round(ty)}"/>`
    } else {
      const my = Math.round((sy + ty) / 2)
      pts = `<omgdi:waypoint x="${Math.round(sx)}" y="${Math.round(sy)}"/>` +
            `<omgdi:waypoint x="${Math.round(sx)}" y="${my}"/>` +
            `<omgdi:waypoint x="${Math.round(tx)}" y="${my}"/>` +
            `<omgdi:waypoint x="${Math.round(tx)}" y="${Math.round(ty)}"/>`
    }
    return `
      <bpmndi:BPMNEdge id="${f.id}_di" bpmnElement="${f.id}">${pts}</bpmndi:BPMNEdge>`
  }).join('')

  const pid   = esc(tpl.processId)
  const pname = esc(tpl.processName)

  return `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
             xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
             xmlns:flowable="http://flowable.org/bpmn"
             xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
             xmlns:omgdc="http://www.omg.org/spec/DD/20100524/DC"
             xmlns:omgdi="http://www.omg.org/spec/DD/20100524/DI"
             typeLanguage="http://www.w3.org/2001/XMLSchema"
             expressionLanguage="http://www.w3.org/1999/XPath"
             targetNamespace="http://www.activiti.org/test">

  <process id="${pid}" name="${pname}" isExecutable="true">
${processBody}
  </process>

  <bpmndi:BPMNDiagram id="BPMNDiagram_${pid}">
    <bpmndi:BPMNPlane id="BPMNPlane_${pid}" bpmnElement="${pid}">${shapes}${edges}
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>

</definitions>`
}

// ─── Schema embedding/extraction ─────────────────────────────────────────────
//
// The block schema is stored as a base64-encoded JSON comment in the BPMN XML
// so the template can be re-opened in the stage builder for editing.
// Base64 is used because XML comments cannot contain "--".

const SCHEMA_MARKER = 'STAGE_SCHEMA:'
const SCHEMA_COMMENT_RE = /<!--STAGE_SCHEMA:([A-Za-z0-9+/=]+)-->/

function schemaToB64(tpl: ProcessTemplate): string {
  return btoa(encodeURIComponent(JSON.stringify(tpl)))
}

function b64ToSchema(b64: string): ProcessTemplate {
  return JSON.parse(decodeURIComponent(atob(b64))) as ProcessTemplate
}

/** Extract the embedded stage schema from a BPMN XML string, or return null. */
export function extractStageSchema(xml: string): ProcessTemplate | null {
  const match = SCHEMA_COMMENT_RE.exec(xml)
  if (!match) return null
  try {
    return b64ToSchema(match[1])
  } catch {
    return null
  }
}

// ─── Public entry point ───────────────────────────────────────────────────────

export function generateBpmnXml(tpl: ProcessTemplate): string {
  _cnt = 0   // reset ID counter for each generation

  const allEls: El[]   = []
  const allFlows: Flow[] = []
  const CX = 450
  let y = 80

  // Start event
  const startEl: El = {
    id: 'startEvent1', type: 'startEvent', name: 'Начало', cg: '',
    x: CX - EW / 2, y, w: EW, h: EH,
  }
  allEls.push(startEl)
  y += EH + VGAP

  let prevBotIds: string[] = [startEl.id]

  for (const stage of tpl.stages) {
    const r = stageBlock(stage, CX, y)

    for (const pid of prevBotIds) {
      for (const tid of r.topIds) {
        allFlows.push({ id: uid('f'), src: pid, tgt: tid })
      }
    }

    allEls.push(...r.els)
    allFlows.push(...r.flows)
    prevBotIds = r.botIds
    y = r.botY + VGAP
  }

  // End event
  const endEl: El = {
    id: 'endEvent1', type: 'endEvent', name: 'Конец', cg: '',
    x: CX - EW / 2, y, w: EW, h: EH,
  }
  allEls.push(endEl)
  for (const pid of prevBotIds) {
    allFlows.push({ id: uid('f'), src: pid, tgt: endEl.id })
  }

  const xml = buildXml(allEls, allFlows, tpl)

  // Embed the schema as a comment right after the XML declaration
  const schemaComment = `<!--${SCHEMA_MARKER}${schemaToB64(tpl)}-->`
  return xml.replace(/^(<\?xml[^?]*\?>)/, `$1\n${schemaComment}`)
}

// Keep marker accessible for tests
export { SCHEMA_MARKER }
