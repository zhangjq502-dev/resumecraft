import { createForm } from '../../../shared/sections'
import { create } from 'zustand'
import { parseDocument, type ResumeDocument } from '../../../shared/resume'
import {
  createLibrary,
  createEntry,
  parseLibrary,
  addSnapshot,
  restoreSnapshot,
  MAX_RESUMES,
  type ResumeLibrary,
  type ResumeEntry
} from '../../../shared/library'
import { example } from './example'
export { example } from './example'

interface ResumeState {
  library: ResumeLibrary
  document: ResumeDocument
  update: (patch: Partial<Omit<ResumeDocument, 'version'>>) => void
  replace: (document: ResumeDocument) => void
  hydrate: (library: ResumeLibrary) => void
  selectResume: (id: string) => void
  createResume: (document?: ResumeDocument) => void
  duplicateResume: () => void
  deleteResume: () => void
  saveSnapshot: (label: string) => boolean
  restoreVersion: (id: string) => void
  deleteSnapshot: (id: string) => void
}
const initial = createLibrary(example)

/** 当前文档始终引用 activeId 对应的 entry.document，不维护第二份独立内容。 */
function view(library: ResumeLibrary): Pick<ResumeState, 'library' | 'document'> {
  return {
    library,
    document: library.entries.find((entry) => entry.id === library.activeId)!.document
  }
}
function changeActive(
  library: ResumeLibrary,
  change: (entry: ResumeEntry) => ResumeEntry
): ResumeLibrary {
  return {
    ...library,
    entries: library.entries.map((entry) => (entry.id === library.activeId ? change(entry) : entry))
  }
}
export const useResume = create<ResumeState>((set, get) => ({
  ...view(initial),
  update: (patch) =>
    set((state) =>
      view(
        changeActive(state.library, (entry) => ({
          ...entry,
          document: parseDocument({ ...entry.document, ...patch }),
          updatedAt: new Date().toISOString()
        }))
      )
    ),
  replace: (document) =>
    set((state) =>
      view(
        changeActive(state.library, (entry) => ({
          ...entry,
          document: parseDocument(document),
          updatedAt: new Date().toISOString()
        }))
      )
    ),
  hydrate: (library) => set(view(parseLibrary(library))),
  selectResume: (id) => {
    const library = get().library
    if (!library.entries.some((entry) => entry.id === id)) throw new Error('简历不存在')
    set(view({ ...library, activeId: id }))
  },
  createResume: (document) => {
    const library = get().library
    if (library.entries.length >= MAX_RESUMES) throw new Error(`最多保存 ${MAX_RESUMES} 份简历`)
    const entry = createEntry(
      document ?? {
        ...example,
        title: '未命名简历',
        markdown: '',
        form: createForm(),
        editorMode: 'form'
      }
    )
    set(view({ ...library, activeId: entry.id, entries: [...library.entries, entry] }))
  },
  duplicateResume: () => {
    const document = get().document
    // 副本拥有独立 ID 和空历史，后续编辑不会影响原件。
    get().createResume({ ...document, title: document.title.slice(0, 95) + ' 副本' })
  },
  deleteResume: () => {
    const library = get().library
    if (library.entries.length <= 1) throw new Error('至少保留一份简历')
    const entries = library.entries.filter((entry) => entry.id !== library.activeId)
    set(view({ ...library, entries, activeId: entries[0].id }))
  },
  saveSnapshot: (label) => {
    const library = get().library
    const active = library.entries.find((entry) => entry.id === library.activeId)!
    const updated = addSnapshot(active, label)
    if (updated === active) return false
    set(view(changeActive(library, () => updated)))
    return true
  },
  restoreVersion: (id) =>
    set((state) => view(changeActive(state.library, (entry) => restoreSnapshot(entry, id)))),
  deleteSnapshot: (id) =>
    set((state) =>
      view(
        changeActive(state.library, (entry) => ({
          ...entry,
          snapshots: entry.snapshots.filter((item) => item.id !== id)
        }))
      )
    )
}))
