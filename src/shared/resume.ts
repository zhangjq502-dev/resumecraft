import type { Appearance } from './appearance'
import { parseForm, formToMarkdown, type ResumeForm } from './sections'
import type { ResumeLibrary } from './library'

/** 主进程和渲染进程共用的数据契约；不依赖 Electron 或浏览器 API。 */
export const THEMES = ['classic', 'modern', 'minimal', 'compact', 'standard'] as const
export type Theme = (typeof THEMES)[number]

/** JSON 备份仅保存内容与版式。version 用于未来识别文件格式并进行迁移。 */
export interface ResumeAvatar {
  /** 内嵌图片便于备份迁移，不保存可能失效的本地绝对路径。 */
  dataUrl: string
  shape: 'square' | 'circle'
}
export const MAX_AVATAR_DATA_LENGTH = 400_000

export interface ResumeDocument {
  version: 1
  title: string
  markdown: string
  theme: Theme
  accentColor?: string
  fontSize: number
  lineHeight: number
  avatar?: ResumeAvatar
  form?: ResumeForm
  editorMode?: 'form' | 'markdown'
}

/** 显式区分成功和失败；data 中的 null 通常代表无草稿或用户取消。 */
export type Result<T> = { ok: true; data: T } | { ok: false; error: string }

/** preload 提供给页面的接口白名单，不暴露任意 IPC 通道或文件路径读写能力。 */
export interface ResumeAPI {
  previewPDF: () => Promise<Result<Uint8Array>>
  pickPDF: () => Promise<Result<{ name: string; bytes: Uint8Array } | null>>
  loadAppearance: () => Promise<Result<Appearance>>
  saveAppearance: (appearance: Appearance) => Promise<Result<null>>
  pickBackground: () => Promise<Result<string | null>>
  pickAvatar: () => Promise<Result<string | null>>
  loadLibrary: () => Promise<Result<ResumeLibrary | null>>
  saveLibrary: (library: ResumeLibrary) => Promise<Result<null>>
  open: () => Promise<Result<ResumeDocument | null>>
  save: (document: ResumeDocument) => Promise<Result<string | null>>
  exportPDF: (title: string) => Promise<Result<string | null>>
}
export const MAX_MARKDOWN_LENGTH = 200_000

/**
 * TypeScript 类型在运行时不存在，因此导入 JSON 和接收 IPC 数据时仍需验证。
 * 验证后重新构造对象，只保留允许的字段，不把外部文件的额外字段带入状态。
 */
export function parseDocument(input: unknown): ResumeDocument {
  if (!input || typeof input !== 'object') throw new Error('简历文件必须是 JSON 对象')
  const candidate = input as Record<string, unknown>
  if (candidate.version !== 1) throw new Error('不支持此简历文件版本')
  if (typeof candidate.title !== 'string' || candidate.title.length > 100)
    throw new Error('标题最多 100 个字符')
  if (typeof candidate.markdown !== 'string' || candidate.markdown.length > MAX_MARKDOWN_LENGTH)
    throw new Error('Markdown 内容最多 200,000 个字符')
  if (!THEMES.includes(candidate.theme as Theme)) throw new Error('未知主题')
  if (
    typeof candidate.fontSize !== 'number' ||
    !Number.isFinite(candidate.fontSize) ||
    candidate.fontSize < 10 ||
    candidate.fontSize > 18
  )
    throw new Error('字号应为 10–18')
  if (
    typeof candidate.lineHeight !== 'number' ||
    !Number.isFinite(candidate.lineHeight) ||
    candidate.lineHeight < 1.2 ||
    candidate.lineHeight > 2
  )
    throw new Error('行高应为 1.2–2')
  if (
    candidate.accentColor !== undefined &&
    (typeof candidate.accentColor !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(candidate.accentColor))
  )
    throw new Error('主题色格式无效')
  let avatar: ResumeAvatar | undefined
  if (candidate.avatar !== undefined) {
    const value = candidate.avatar as Partial<ResumeAvatar> | null
    if (
      !value ||
      typeof value.dataUrl !== 'string' ||
      value.dataUrl.length > MAX_AVATAR_DATA_LENGTH ||
      !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(value.dataUrl) ||
      !['square', 'circle'].includes(value.shape ?? '')
    )
      throw new Error('头像格式无效或图片过大')
    avatar = { dataUrl: value.dataUrl, shape: value.shape as ResumeAvatar['shape'] }
  }
  if (
    candidate.editorMode !== undefined &&
    !['form', 'markdown'].includes(candidate.editorMode as string)
  )
    throw new Error('未知编辑模式')
  const form = candidate.form === undefined ? undefined : parseForm(candidate.form)
  if (candidate.editorMode === 'form' && !form) throw new Error('表单模式缺少模块配置')
  const markdown =
    candidate.editorMode === 'form' && form ? formToMarkdown(form) : candidate.markdown
  if (markdown.length > MAX_MARKDOWN_LENGTH) throw new Error('模块生成的内容超过长度限制')
  return {
    ...(form ? { form } : {}),
    ...(candidate.editorMode ? { editorMode: candidate.editorMode as 'form' | 'markdown' } : {}),
    ...(avatar ? { avatar } : {}),
    ...(candidate.accentColor ? { accentColor: candidate.accentColor as string } : {}),
    version: 1,
    title: candidate.title,
    markdown,
    theme: candidate.theme as Theme,
    fontSize: candidate.fontSize,
    lineHeight: candidate.lineHeight
  }
}
