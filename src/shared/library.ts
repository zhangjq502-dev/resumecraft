import { parseDocument, type ResumeDocument } from './resume'

export const MAX_RESUMES = 30
export const MAX_SNAPSHOTS = 20
export const MAX_LIBRARY_BYTES = 32 * 1024 * 1024

export interface Snapshot {
  id: string
  createdAt: string
  label: string
  document: ResumeDocument
}
export interface ResumeEntry {
  id: string
  updatedAt: string
  document: ResumeDocument
  snapshots: Snapshot[]
}
/** v2 将多份简历和历史放在一起写入，切换与恢复不会产生跨文件的半完成状态。 */
export interface ResumeLibrary {
  version: 2
  activeId: string
  entries: ResumeEntry[]
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('无效的简历库结构')
  return value as Record<string, unknown>
}
function identifier(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(value))
    throw new Error('无效的记录 ID')
  return value
}
function timestamp(value: unknown): string {
  if (typeof value !== 'string' || value.length > 40 || !Number.isFinite(Date.parse(value)))
    throw new Error('无效的记录时间')
  return value
}

/** 所有入口复用同一验证，拒绝重复 ID、悬空选中项和无限增长的历史数据。 */
export function parseLibrary(value: unknown): ResumeLibrary {
  const input = record(value)
  if (
    input.version !== 2 ||
    !Array.isArray(input.entries) ||
    !input.entries.length ||
    input.entries.length > MAX_RESUMES
  )
    throw new Error(`简历库应包含 1–${MAX_RESUMES} 份简历`)
  const ids = new Set<string>()
  const entries = input.entries.map((value): ResumeEntry => {
    const entry = record(value)
    const id = identifier(entry.id)
    if (ids.has(id)) throw new Error('简历 ID 重复')
    ids.add(id)
    if (!Array.isArray(entry.snapshots) || entry.snapshots.length > MAX_SNAPSHOTS)
      throw new Error('历史版本数量超限')
    const snapshotIds = new Set<string>()
    const snapshots = entry.snapshots.map((value): Snapshot => {
      const snapshot = record(value)
      const snapshotId = identifier(snapshot.id)
      if (snapshotIds.has(snapshotId)) throw new Error('历史版本 ID 重复')
      snapshotIds.add(snapshotId)
      if (typeof snapshot.label !== 'string' || snapshot.label.length > 100)
        throw new Error('版本名称最多 100 字符')
      return {
        id: snapshotId,
        label: snapshot.label,
        createdAt: timestamp(snapshot.createdAt),
        document: parseDocument(snapshot.document)
      }
    })
    return {
      id,
      updatedAt: timestamp(entry.updatedAt),
      document: parseDocument(entry.document),
      snapshots
    }
  })
  const activeId = identifier(input.activeId)
  if (!ids.has(activeId)) throw new Error('当前简历不存在')
  return { version: 2, activeId, entries }
}

export function createEntry(document: ResumeDocument): ResumeEntry {
  return {
    id: crypto.randomUUID(),
    updatedAt: new Date().toISOString(),
    document: parseDocument(document),
    snapshots: []
  }
}
export function createLibrary(document: ResumeDocument): ResumeLibrary {
  const entry = createEntry(document)
  return { version: 2, activeId: entry.id, entries: [entry] }
}
export function sameDocument(a: ResumeDocument, b: ResumeDocument): boolean {
  return (
    a.title === b.title &&
    a.markdown === b.markdown &&
    a.theme === b.theme &&
    a.accentColor === b.accentColor &&
    a.fontSize === b.fontSize &&
    a.lineHeight === b.lineHeight &&
    a.avatar?.dataUrl === b.avatar?.dataUrl &&
    a.avatar?.shape === b.avatar?.shape &&
    a.editorMode === b.editorMode &&
    JSON.stringify(a.form) === JSON.stringify(b.form)
  )
}
/** 相邻版本内容相同则不重复创建。只保留最近 20 个手动快照。 */
export function addSnapshot(entry: ResumeEntry, label: string): ResumeEntry {
  if (entry.snapshots[0] && sameDocument(entry.snapshots[0].document, entry.document)) return entry
  const snapshot: Snapshot = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    label: label.trim().slice(0, 100) || '手动保存',
    document: { ...entry.document }
  }
  return { ...entry, snapshots: [snapshot, ...entry.snapshots].slice(0, MAX_SNAPSHOTS) }
}
/** 恢复前先保留当前内容，再恢复目标；即使历史轮转，目标引用也不会丢失。 */
export function restoreSnapshot(entry: ResumeEntry, snapshotId: string): ResumeEntry {
  const target = entry.snapshots.find((item) => item.id === snapshotId)
  if (!target) throw new Error('历史版本不存在')
  if (sameDocument(entry.document, target.document)) return entry
  const preserved = addSnapshot(entry, '恢复前自动备份')
  return { ...preserved, document: { ...target.document }, updatedAt: new Date().toISOString() }
}

export interface DiffLine {
  kind: 'same' | 'removed' | 'added'
  text: string
}
/**
 * 线性比较公共前后缀，中间区间按替换展示。不是最短编辑距离算法，
 * 但空间与行数线性相关，长文档不会产生 LCS 的二维矩阵。
 */
export function compareLines(previous: string, current: string): DiffLine[] {
  if (previous === current) return []
  const before = previous.split('\n')
  const after = current.split('\n')
  let prefix = 0
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix])
    prefix++
  let suffix = 0
  while (
    suffix < before.length - prefix &&
    suffix < after.length - prefix &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  )
    suffix++
  return [
    ...before
      .slice(Math.max(0, prefix - 2), prefix)
      .map((text): DiffLine => ({ kind: 'same', text })),
    ...before
      .slice(prefix, before.length - suffix)
      .map((text): DiffLine => ({ kind: 'removed', text })),
    ...after
      .slice(prefix, after.length - suffix)
      .map((text): DiffLine => ({ kind: 'added', text })),
    ...after
      .slice(after.length - suffix, after.length - suffix + 2)
      .map((text): DiffLine => ({ kind: 'same', text }))
  ]
}
