import { memo, type CSSProperties } from 'react'
import { EditableResume } from './EditableResume'
import type { ResumeDocument } from '../../../shared/resume'
import styles from './ResumePreview.module.scss'

interface ResumePreviewProps {
  document: ResumeDocument
  disabled?: boolean
  onError?: (message: string) => void
  onEditingChange?: (editing: boolean) => void
}

// 预览只负责展示；memo 配合父组件的延后更新，跳过数据引用未变的重复渲染。
export const ResumePreview = memo(function ResumePreview({
  document,
  disabled = false,
  onError = console.error,
  onEditingChange
}: ResumePreviewProps) {
  return (
    <article
      id="resume-paper"
      onFocusCapture={() => onEditingChange?.(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          onEditingChange?.(false)
      }}
      className={`${styles.paper} ${styles[document.theme]}`}
      // CSS 变量供各主题复用，屏幕预览与打印使用相同字号和行高。
      style={
        {
          ...(document.accentColor ? { '--accent': document.accentColor } : {}),
          '--resume-size': `${document.fontSize}px`,
          '--resume-leading': document.lineHeight
        } as CSSProperties
      }
    >
      {document.avatar && (
        <img
          className={`${styles.avatar} ${document.avatar.shape === 'circle' ? styles.circle : ''}`}
          src={document.avatar.dataUrl}
          alt="简历头像"
        />
      )}
      <EditableResume document={document} disabled={disabled} onError={onError} />
      {!document.markdown.trim() && !document.form && (
        <p className={styles.placeholder}>从左侧开始写下你的经历。</p>
      )}
    </article>
  )
})
