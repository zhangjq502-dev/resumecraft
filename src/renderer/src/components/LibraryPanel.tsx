import { useState } from 'react'
import { MAX_RESUMES, MAX_SNAPSHOTS, compareLines } from '../../../shared/library'
import { useResume } from '../store/resume'
import styles from './LibraryPanel.module.scss'

/** 简历库与版本历史独立成组件，App 只负责保存和文件操作。 */
export function LibraryPanel({
  disabled,
  onError
}: {
  disabled: boolean
  onError: (message: string) => void
}): React.JSX.Element {
  const library = useResume((state) => state.library)
  const active = library.entries.find((entry) => entry.id === library.activeId)!
  const [historyOpen, setHistoryOpen] = useState(false)
  const [selectedId, setSelectedId] = useState('')
  const [label, setLabel] = useState('')
  const [notice, setNotice] = useState('')
  const selected = active.snapshots.find((item) => item.id === selectedId) ?? active.snapshots[0]
  const changes = selected ? compareLines(selected.document.markdown, active.document.markdown) : []

  function perform(action: () => void): void {
    try {
      setNotice('')
      action()
    } catch (error) {
      onError(error instanceof Error ? error.message : '操作失败')
    }
  }
  return (
    <div className={styles.library}>
      <div className={styles.title}>
        <strong>我的简历</strong>
        <span>
          {library.entries.length}/{MAX_RESUMES}
        </span>
      </div>
      <label className={styles.selectLabel}>
        当前简历
        <select
          aria-label="切换简历"
          disabled={disabled}
          value={library.activeId}
          onChange={(event) =>
            perform(() => {
              useResume.getState().selectResume(event.target.value)
              setSelectedId('')
              setLabel('')
            })
          }
        >
          {library.entries.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.document.title || '未命名简历'}
            </option>
          ))}
        </select>
      </label>
      <div className={styles.buttons}>
        <button
          disabled={disabled || library.entries.length >= MAX_RESUMES}
          onClick={() => perform(() => useResume.getState().createResume())}
        >
          新建
        </button>
        <button
          disabled={disabled || library.entries.length >= MAX_RESUMES}
          onClick={() => perform(() => useResume.getState().duplicateResume())}
        >
          复制
        </button>
        <button
          disabled={disabled || library.entries.length <= 1}
          onClick={() => {
            if (
              window.confirm(
                `删除“${active.document.title || '未命名简历'}”及其全部历史？此操作不可撤销。`
              )
            )
              perform(() => useResume.getState().deleteResume())
          }}
        >
          删除
        </button>
      </div>

      <button
        className={styles.historyButton}
        disabled={disabled}
        onClick={() => setHistoryOpen(!historyOpen)}
        aria-expanded={historyOpen}
      >
        版本历史 · {active.snapshots.length} {historyOpen ? '−' : '+'}
      </button>
      {historyOpen && (
        <section aria-label="版本历史" className={styles.history}>
          <label>
            版本备注
            <input
              aria-label="版本备注"
              disabled={disabled}
              maxLength={100}
              value={label}
              placeholder="例如：投递前端岗位"
              onChange={(event) => setLabel(event.target.value)}
            />
          </label>
          <button
            disabled={disabled}
            onClick={() =>
              perform(() => {
                const created = useResume.getState().saveSnapshot(label)
                setNotice(created ? '版本已保存' : '与最近版本相同，无需重复保存')
                setLabel('')
              })
            }
          >
            保存当前版本
          </button>
          {notice && <p role="status">{notice}</p>}
          <p className={styles.hint}>保留最近 {MAX_SNAPSHOTS} 个版本，自动保存不创建快照。</p>
          {!selected ? (
            <p className={styles.hint}>暂无版本，先保存一个快照。</p>
          ) : (
            <>
              <select
                aria-label="选择历史版本"
                value={selected.id}
                disabled={disabled}
                onChange={(event) => setSelectedId(event.target.value)}
              >
                {active.snapshots.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label} · {new Date(item.createdAt).toLocaleString()}
                  </option>
                ))}
              </select>
              <p className={styles.hint}>
                比较：选中版本 → 当前编辑。红色为旧内容，绿色为新内容；中间变更区间整体展示。
              </p>
              {selected.document.title !== active.document.title && (
                <p>
                  标题：{selected.document.title} → {active.document.title}
                </p>
              )}
              {(selected.document.theme !== active.document.theme ||
                selected.document.fontSize !== active.document.fontSize ||
                selected.document.lineHeight !== active.document.lineHeight) && (
                <p>
                  版式：{selected.document.theme} / {selected.document.fontSize}px /{' '}
                  {selected.document.lineHeight} → {active.document.theme} /{' '}
                  {active.document.fontSize}px / {active.document.lineHeight}
                </p>
              )}
              {(selected.document.avatar?.dataUrl !== active.document.avatar?.dataUrl ||
                selected.document.avatar?.shape !== active.document.avatar?.shape) && (
                <p>头像或头像形状已变更</p>
              )}
              {JSON.stringify(selected.document.form) !== JSON.stringify(active.document.form) && (
                <p>模块配置已变更（含隐藏内容或排序）</p>
              )}
              <div className={styles.diff} aria-label="版本内容差异">
                {!changes.length ? (
                  <p>Markdown 内容相同</p>
                ) : (
                  changes.map((line, index) => (
                    <div key={index} className={styles[line.kind]}>
                      <span>
                        {line.kind === 'removed' ? '−' : line.kind === 'added' ? '+' : ' '}
                      </span>
                      {line.text || ' '}
                    </div>
                  ))
                )}
              </div>
              <div className={styles.buttons}>
                <button
                  disabled={disabled}
                  onClick={() => {
                    if (window.confirm('恢复此版本？当前内容会先自动保存为快照。'))
                      perform(() => useResume.getState().restoreVersion(selected.id))
                  }}
                >
                  恢复版本
                </button>
                <button
                  disabled={disabled}
                  onClick={() => {
                    if (window.confirm('删除这个历史快照？'))
                      perform(() => useResume.getState().deleteSnapshot(selected.id))
                  }}
                >
                  删除快照
                </button>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  )
}
