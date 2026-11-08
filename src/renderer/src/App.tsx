import { useDeferredValue, useEffect, useRef, useState } from 'react'
import { MAX_MARKDOWN_LENGTH, parseDocument, type Result } from '../../shared/resume'
import { useResume, example } from './store/resume'
import { TemplateGallery } from './components/TemplateGallery'
import { recognizeResume } from '../../shared/recognize-resume'
import { createTemplateDocument } from '../../shared/templates'
import { PDFImportDialog } from './components/PDFImportDialog'
import type { PDFImportDraft } from './utils/import-pdf'
import { MAX_RESUMES } from '../../shared/library'
import { BackgroundSettings } from './components/BackgroundSettings'
import { useAppearance } from './store/appearance'
import { AccentColorSettings } from './components/AccentColorSettings'
import { AvatarSettings } from './components/AvatarSettings'
import { SectionEditor } from './components/SectionEditor'
import { LibraryPanel } from './components/LibraryPanel'
import { PDFPages } from './components/PDFPages'
import { ResumePreview } from './components/ResumePreview'
import appIcon from './assets/resumecraft.png'
import styles from './App.module.scss'

// 自动保存等待输入暂停；纸张换算采用 CSS 的 96 px/in 和 25.4 mm/in。
const AUTOSAVE_DELAY_MS = 500
const A4_WIDTH_PX = (210 * 96) / 25.4
const MIN_PREVIEW_SCALE = 0.3
const THEME_OPTIONS = [
  { value: 'classic', label: '经典蓝' },
  { value: 'modern', label: '清新绿' },
  { value: 'minimal', label: '极简黑' }
] as const

/** 将 IPC 的失败结果转为异常，交给页面统一显示。 */
function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.error)
  return result.data
}

export default function App(): React.JSX.Element {
  // 简历内容由 Zustand 管理；按钮状态、提示等临时界面状态留在组件中。
  const appearance = useAppearance((state) => state.appearance)
  const library = useResume((state) => state.library)
  const hydrate = useResume((state) => state.hydrate)
  const document = useResume((state) => state.document)
  const update = useResume((state) => state.update)
  const replace = useResume((state) => state.replace)
  // 输入立即更新，预览更新可被更紧急的输入打断；这不等于减少解析总耗时。
  const preview = useDeferredValue(document)
  const [editingPreview, setEditingPreview] = useState(false)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [pdfDraft, setPdfDraft] = useState<PDFImportDraft | null>(null)
  const [importProgress, setImportProgress] = useState('')
  const [ready, setReady] = useState(false)
  const [status, setStatus] = useState('正在恢复草稿…')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [help, setHelp] = useState(false)
  const [paperEditing, setPaperEditing] = useState(false)
  const [scale, setScale] = useState(1)
  const previewContainerRef = useRef<HTMLDivElement>(null)
  const [autosaveEnabled, setAutosaveEnabled] = useState(true)
  const closeAllowed = useRef(false)
  const [editorTab, setEditorTab] = useState<'form' | 'markdown'>('form')
  const characterCount = document.markdown.replace(/\s/g, '').length

  // 恢复简历库完成前禁止编辑和保存；存储服务会自动迁移旧版单份草稿。
  useEffect(() => {
    let active = true
    void window.resume
      .loadLibrary()
      .then((result) => {
        if (!active) return
        const draft = unwrap(result)
        if (draft) hydrate(draft)
        setStatus(draft ? '已恢复本地草稿' : '准备就绪 · 开始编辑吧')
        setReady(true)
      })
      .catch((reason: Error) => {
        if (!active) return
        setError(reason.message)
        // 草稿异常时暂停保存，避免用示例内容覆盖损坏文件。
        setAutosaveEnabled(false)
        setStatus('草稿异常 · 自动保存已暂停')
        setReady(true)
      })
    // 卸载或 StrictMode 重跑 effect 后，旧异步结果不再更新页面。
    return () => {
      active = false
    }
  }, [hydrate])

  // 每次内容变化都重置计时器：停止输入后才调用文件服务。
  useEffect(() => {
    if (!ready || !autosaveEnabled) return
    let active = true
    const timer = setTimeout(() => {
      setStatus('正在保存…')
      void window.resume
        .saveLibrary(library)
        .then((result) => {
          unwrap(result)
          if (active) setStatus('已保存到本机')
        })
        .catch((reason: Error) => {
          if (active) {
            setError(reason.message)
            setStatus('保存失败，请备份')
          }
        })
    }, AUTOSAVE_DELAY_MS)
    return () => {
      clearTimeout(timer)
      // 已发出的写入不能撤销，但旧结果不应覆盖新一轮保存的状态提示。
      active = false
    }
  }, [library, ready, autosaveEnabled])

  // 关闭窗口时补存防抖期间尚未提交的输入；成功后放行第二次关闭。
  useEffect(() => {
    const flush = (event: BeforeUnloadEvent): void => {
      if (!ready || !autosaveEnabled || closeAllowed.current) return
      event.preventDefault()
      event.returnValue = ''
      void window.resume
        // 事件触发时取整个简历库，包含所有文档及历史，防止切换时漏存。
        .saveLibrary(useResume.getState().library)
        .then((result) => {
          unwrap(result)
          closeAllowed.current = true
          window.close()
        })
        .catch((reason: Error) => {
          setError(reason.message)
          setStatus('保存失败，请先备份再关闭')
        })
    }
    window.addEventListener('beforeunload', flush)
    return () => window.removeEventListener('beforeunload', flush)
  }, [ready, autosaveEnabled])

  /** 文件操作共用忙碌状态和错误处理，结束时始终恢复界面。 */
  async function runDocumentAction(action: () => Promise<void>): Promise<void> {
    if (busy || !ready) return
    setBusy(true)
    setError('')
    try {
      await action()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '操作失败')
    } finally {
      setBusy(false)
    }
  }

  // 取消系统对话框返回 null，不作为错误处理。
  async function saveBackup(): Promise<void> {
    const path = unwrap(await window.resume.save(useResume.getState().document))
    if (path) setStatus('JSON 备份已保存')
  }

  async function openBackup(): Promise<void> {
    const next = unwrap(await window.resume.open())
    if (next) {
      useResume.getState().createResume(next)
      setAutosaveEnabled(true)
      setStatus('备份已作为新简历导入')
    }
  }

  async function importPDF(): Promise<void> {
    if (useResume.getState().library.entries.length >= MAX_RESUMES)
      throw new Error('简历数量已达上限，请先删除不需要的简历')
    const source = unwrap(await window.resume.pickPDF())
    if (!source) return
    setImportProgress('正在解析 PDF…')
    try {
      // 按需加载解析器，普通编辑启动不需要下载或初始化 PDF worker。
      const { extractPDF } = await import('./utils/import-pdf')
      setPdfDraft(await extractPDF(source.name, source.bytes, setImportProgress))
    } finally {
      setImportProgress('')
    }
  }

  async function exportPDF(): Promise<void> {
    // 按钮仅在预览与输入一致时启用；操作期间锁定编辑，再留出绘制机会后打印。
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    )
    const path = unwrap(await window.resume.exportPDF(useResume.getState().document.title))
    if (path) setStatus('PDF 导出成功')
  }

  // 快捷键复用备份按钮，遵循按钮当前的 disabled 状态。
  useEffect(() => {
    const shortcut = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        globalThis.document.getElementById('save-backup')?.click()
      }
    }
    window.addEventListener('keydown', shortcut)
    return () => window.removeEventListener('keydown', shortcut)
  }, [])

  // 屏幕预览按可用宽度缩放；打印样式会将缩放恢复为 1，保留 A4 尺寸。
  useEffect(() => {
    const element = previewContainerRef.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      setScale(Math.min(1, Math.max(MIN_PREVIEW_SCALE, entry.contentRect.width / A4_WIDTH_PX)))
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  function switchEditorTab(tab: 'form' | 'markdown'): void {
    // Markdown 是独立编辑模式，不尝试反向猜测表单结构；两份内容均保存。
    if (tab === 'markdown' && document.editorMode === 'form') {
      update({ editorMode: 'markdown' })
    } else if (tab === 'form' && document.form && document.editorMode !== 'form') {
      if (
        !window.confirm(
          '切回表单将用保存的模块配置重新生成内容。当前 Markdown 会先保存为历史版本，是否继续？'
        )
      )
        return
      useResume.getState().saveSnapshot('切回表单前的 Markdown')
      update({ editorMode: 'form' })
    }
    setEditorTab(tab)
  }
  const isEditorLocked = busy || !ready
  return (
    <div className={styles.app}>
      {/* 顶部文件操作：系统对话框和文件读写由主进程执行。 */}
      <header className={styles.header}>
        <div className={styles.brand}>
          <img className={styles.logo} src={appIcon} alt="" aria-hidden="true" />
          <div>
            <strong>ResumeCraft</strong>
            <small>{document.title || '未命名简历'}</small>
          </div>
        </div>
        <div className={styles.actions}>
          <button disabled={isEditorLocked} onClick={() => setTemplatesOpen(true)}>
            选择模板
          </button>
          <button disabled={isEditorLocked} onClick={() => void runDocumentAction(importPDF)}>
            {importProgress || '导入 PDF'}
          </button>
          <button disabled={isEditorLocked} onClick={() => void runDocumentAction(openBackup)}>
            打开备份
          </button>
          <button
            id="save-backup"
            disabled={isEditorLocked}
            onClick={() => void runDocumentAction(saveBackup)}
          >
            保存 JSON
          </button>
          <button
            className={styles.primary}
            disabled={isEditorLocked || preview !== document || !document.markdown.trim()}
            onClick={() => void runDocumentAction(exportPDF)}
          >
            {busy ? '处理中…' : '导出 PDF'}
          </button>
        </div>
      </header>
      {error && (
        <div className={styles.error} role="alert">
          {error}
          <button onClick={() => setError('')}>关闭提示</button>
        </div>
      )}
      {templatesOpen && (
        <TemplateGallery
          current={document.theme}
          onClose={() => setTemplatesOpen(false)}
          onApply={(theme) => {
            update({ theme })
            setTemplatesOpen(false)
          }}
          onCreate={(theme) => {
            try {
              useResume.getState().createResume(createTemplateDocument(theme))
              setEditorTab('form')
              setTemplatesOpen(false)
              setStatus('模板已创建，点击简历文字即可修改')
            } catch (error) {
              setError(error instanceof Error ? error.message : '创建失败')
            }
          }}
        />
      )}
      {pdfDraft && (
        <PDFImportDialog
          draft={pdfDraft}
          onCancel={() => setPdfDraft(null)}
          onConfirm={(title, markdown) => {
            try {
              const recognized = recognizeResume(markdown)
              const structured = parseDocument({
                version: 1,
                title,
                markdown,
                form: recognized.form,
                editorMode: 'form',
                theme: 'standard',
                fontSize: 15,
                lineHeight: 1.55
              })
              useResume.getState().createResume({
                version: 1,
                title,
                markdown,
                theme: 'classic',
                fontSize: 15,
                lineHeight: 1.55,
                editorMode: 'markdown'
              })
              useResume.getState().saveSnapshot('PDF 提取原文')
              useResume.getState().update(structured)
              setEditorTab('form')
              setAutosaveEnabled(true)
              setPdfDraft(null)
              setStatus('已识别为模块表单，请逐项核对内容后导出')
            } catch (error) {
              setError(error instanceof Error ? error.message : '导入失败')
            }
          }}
        />
      )}
      <main className={styles.workspace}>
        {/* 左侧：文档名称与版式设置，不直接修改预览 DOM。 */}
        <aside className={styles.sidebar}>
          <LibraryPanel disabled={isEditorLocked || !autosaveEnabled} onError={setError} />
          <span className={styles.eyebrow}>文档名称</span>
          <label className={styles.field}>
            <span className={styles.srOnly}>简历名称</span>
            <input
              maxLength={100}
              value={document.title}
              disabled={isEditorLocked}
              onChange={(event) => update({ title: event.target.value })}
            />
          </label>
          <details className={styles.settingsDisclosure}>
            <summary>版式与照片</summary>
            <div className={styles.settingsContent}>
              <AvatarSettings disabled={isEditorLocked} onError={setError} />
              <span className={styles.eyebrow}>版式设置</span>
              <fieldset disabled={isEditorLocked} className={styles.themes}>
                <legend>选择主题</legend>
                {THEME_OPTIONS.map(({ value: theme, label }) => (
                  <button
                    key={theme}
                    aria-pressed={document.theme === theme}
                    className={document.theme === theme ? styles.selected : ''}
                    onClick={() => update({ theme })}
                  >
                    <span className={`${styles.swatch} ${styles[theme]}`}>
                      <b />
                      <i />
                      <i />
                      <i />
                    </span>
                    {label}
                  </button>
                ))}
              </fieldset>
              <AccentColorSettings disabled={isEditorLocked} />
              <label className={styles.field}>
                正文字号 <output>{document.fontSize}px</output>
                <input
                  type="range"
                  min="10"
                  max="18"
                  step="1"
                  disabled={isEditorLocked}
                  value={document.fontSize}
                  onChange={(event) => update({ fontSize: Number(event.target.value) })}
                />
              </label>
              <label className={styles.field}>
                正文行高 <output>{document.lineHeight.toFixed(2)}</output>
                <input
                  type="range"
                  min="1.2"
                  max="2"
                  step="0.05"
                  disabled={isEditorLocked}
                  value={document.lineHeight}
                  onChange={(event) => update({ lineHeight: Number(event.target.value) })}
                />
              </label>
            </div>
          </details>
          <BackgroundSettings disabled={isEditorLocked} onError={setError} />
          <button className={styles.helpButton} onClick={() => setHelp(!help)} aria-expanded={help}>
            语法参考 {help ? '−' : '+'}
          </button>
          {help && (
            <div className={styles.help}>
              <p># 姓名</p>
              <p>## 教育背景</p>
              <p>### 学校 / 项目名称</p>
              <p>- 列表条目</p>
              <p>**加粗重点**</p>
              <p>[链接名称](https://…)</p>
              <p>空一行开始新段落。支持表格，不执行 HTML，也不加载远程图片。</p>
            </div>
          )}
          <div className={styles.local}>
            文档保存在本机
            <br />
            需要迁移时，请先备份。
          </div>
          <button
            disabled={isEditorLocked}
            onClick={() => {
              if (window.confirm('将替换当前内容，是否载入示例？')) {
                replace(example)
                setAutosaveEnabled(true)
              }
            }}
          >
            载入示例
          </button>
        </aside>
        {/* 中间：受控输入，每次变更只更新简历数据。 */}
        <section className={styles.editor} aria-label="Markdown 编辑区">
          <div className={styles.panelHeader}>
            <strong>编辑内容</strong>
            <div className={styles.editorTabs}>
              <button
                disabled={isEditorLocked}
                aria-pressed={editorTab === 'form'}
                onClick={() => switchEditorTab('form')}
              >
                模块表单
              </button>
              <button
                disabled={isEditorLocked}
                aria-pressed={editorTab === 'markdown'}
                onClick={() => switchEditorTab('markdown')}
              >
                Markdown
              </button>
            </div>
          </div>
          {editorTab === 'form' ? (
            <>
              {document.form && document.editorMode !== 'form' ? (
                <div className={styles.modeNotice}>
                  <p>
                    当前内容来自 Markdown
                    编辑。切回表单后将使用模块数据生成预览，当前文字会先保存为历史版本。
                  </p>
                  <button disabled={isEditorLocked} onClick={() => switchEditorTab('form')}>
                    启用表单编辑
                  </button>
                </div>
              ) : (
                <SectionEditor disabled={isEditorLocked} onError={setError} />
              )}
            </>
          ) : (
            <>
              <textarea
                aria-label="简历 Markdown 内容"
                spellCheck={false}
                value={document.markdown}
                disabled={isEditorLocked}
                maxLength={MAX_MARKDOWN_LENGTH}
                onChange={(event) =>
                  update({ markdown: event.target.value, editorMode: 'markdown' })
                }
                placeholder="# 你的姓名&#10;&#10;从这里开始编写简历…"
              />
            </>
          )}
          <div className={styles.editorFooter}>
            <span>{characterCount.toLocaleString()} 字符</span>
            <span>⌘ / Ctrl + S 备份</span>
          </div>
        </section>
        {/* 右侧：同一份预览 DOM 同时用于屏幕显示与 PDF 打印。 */}
        <section className={styles.preview} aria-label="简历实时预览">
          <div className={styles.panelHeader}>
            <strong>实时预览</strong>
            <div className={styles.previewTools}>
              <label>
                字号
                <select
                  aria-label="预览正文字号"
                  disabled={isEditorLocked}
                  value={document.fontSize}
                  onChange={(event) => update({ fontSize: Number(event.target.value) })}
                >
                  {Array.from({ length: 9 }, (_, index) => index + 10).map((size) => (
                    <option key={size} value={size}>
                      {size} px
                    </option>
                  ))}
                  {!Number.isInteger(document.fontSize) && (
                    <option value={document.fontSize}>{document.fontSize} px</option>
                  )}
                </select>
              </label>
              <button
                disabled={isEditorLocked}
                title="正文 15 px，行高 1.55"
                onClick={() => update({ fontSize: 15, lineHeight: 1.55 })}
              >
                清晰排版
              </button>
              <button onClick={() => setPaperEditing(!paperEditing)}>
                {paperEditing ? '查看 A4 分页' : '直接编辑'}
              </button>
            </div>
          </div>
          <div
            className={styles.paperScroll}
            ref={previewContainerRef}
            style={
              appearance.background
                ? {
                    backgroundImage: `linear-gradient(rgba(255,255,255,${appearance.overlay}),rgba(255,255,255,${appearance.overlay})),url("${appearance.background}")`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    backgroundAttachment: 'local'
                  }
                : undefined
            }
          >
            <div className={styles.scaledPaper} style={{ zoom: scale }}>
              <div className={paperEditing ? styles.editablePaper : styles.printSource}>
                <ResumePreview
                  document={editingPreview ? document : preview}
                  disabled={isEditorLocked}
                  onError={setError}
                  onEditingChange={setEditingPreview}
                />
              </div>
              {!paperEditing && <PDFPages document={preview} />}
            </div>
          </div>
          <div className={styles.previewFooter}>
            {paperEditing
              ? '直接编辑模式 · 切换 A4 分页查看导出效果'
              : 'A4 分页预览 · 与导出 PDF 使用相同排版'}
          </div>
        </section>
      </main>
      <footer className={styles.status} role="status">
        <span>{status}</span>
        <span>© 2026 ResumeCraft</span>
      </footer>
    </div>
  )
}
