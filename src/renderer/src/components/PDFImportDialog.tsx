import { useEffect, useRef, useState } from 'react'
import type { PDFImportDraft } from '../utils/import-pdf'
import styles from './PDFImportDialog.module.scss'

/** 确认前只编辑临时结果，取消不会写入或替换任何简历。 */
export function PDFImportDialog({
  draft,
  onCancel,
  onConfirm
}: {
  draft: PDFImportDraft
  onCancel: () => void
  onConfirm: (title: string, markdown: string) => void
}): React.JSX.Element {
  const dialog = useRef<HTMLDialogElement>(null)
  const [title, setTitle] = useState(draft.title)
  const [markdown, setMarkdown] = useState(draft.markdown)
  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])
  return (
    <dialog
      className={styles.dialog}
      ref={dialog}
      onCancel={(event) => {
        event.preventDefault()
        onCancel()
      }}
      aria-labelledby="pdf-import-title"
    >
      <header>
        <h2 id="pdf-import-title">确认 PDF 导入内容</h2>
        <span>{draft.pageCount} 页</span>
      </header>
      <div className={styles.notices}>
        {draft.warnings.map((warning) => (
          <p key={warning}>{warning}</p>
        ))}
      </div>
      <label>
        简历名称
        <input
          aria-label="导入简历名称"
          maxLength={100}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>
      <label className={styles.content}>
        提取内容（确认后识别为模块表单，原文保留为快照）
        <textarea
          aria-label="PDF 提取内容"
          maxLength={200000}
          value={markdown}
          onChange={(event) => setMarkdown(event.target.value)}
        />
      </label>
      <footer>
        <button onClick={onCancel}>取消导入</button>
        <button
          className={styles.confirm}
          disabled={!title.trim() || !markdown.trim()}
          onClick={() => onConfirm(title.trim(), markdown)}
        >
          创建简历
        </button>
      </footer>
    </dialog>
  )
}
