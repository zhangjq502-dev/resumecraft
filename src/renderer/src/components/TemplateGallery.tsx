import { useEffect, useRef } from 'react'
import { RESUME_TEMPLATES } from '../../../shared/templates'
import type { Theme } from '../../../shared/resume'
import styles from './TemplateGallery.module.scss'

export function TemplateGallery({
  current,
  onClose,
  onApply,
  onCreate
}: {
  current: Theme
  onClose: () => void
  onApply: (theme: Theme) => void
  onCreate: (theme: Theme) => void
}): React.JSX.Element {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])
  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby="template-gallery-title"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
    >
      <header>
        <div>
          <h2 id="template-gallery-title">选择简历模板</h2>
          <p>应用模板保留当前内容；从模板新建会创建独立简历。</p>
        </div>
        <button onClick={onClose}>关闭</button>
      </header>
      <div className={styles.grid}>
        {RESUME_TEMPLATES.map((template) => (
          <section key={template.id}>
            <div className={`${styles.thumbnail} ${styles[template.id]}`} aria-hidden="true">
              <strong>你的姓名</strong>
              <small>联系方式 · 求职意向</small>
              {['教育背景', '项目经历', '专业技能'].map((heading) => (
                <div key={heading}>
                  <b>{heading}</b>
                  <div>
                    <i />
                    <i />
                    <i />
                  </div>
                </div>
              ))}
            </div>
            <h3>
              {template.name}
              {current === template.id && <span>当前</span>}
            </h3>
            <p>{template.description}</p>
            <div className={styles.actions}>
              <button aria-label={`应用${template.name}`} onClick={() => onApply(template.id)}>
                应用模板
              </button>
              <button aria-label={`新建${template.name}`} onClick={() => onCreate(template.id)}>
                从模板新建
              </button>
            </div>
          </section>
        ))}
      </div>
      <footer>应用后可直接点击简历上的文字编辑，修改会同步到模块表单。</footer>
    </dialog>
  )
}
