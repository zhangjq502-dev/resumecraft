import { parseDocument } from '../../../shared/resume'
import { recognizeResume } from '../../../shared/recognize-resume'
import { useState } from 'react'
import {
  createForm,
  createItem,
  definitionFor,
  MAX_SECTION_ITEMS,
  type ResumeSection,
  type ResumeForm
} from '../../../shared/sections'
import { useResume } from '../store/resume'
import { AvatarSettings } from './AvatarSettings'
import styles from './SectionEditor.module.scss'

export function SectionEditor({
  disabled,
  onError
}: {
  disabled: boolean
  onError: (message: string) => void
}): React.JSX.Element {
  const document = useResume((state) => state.document)
  const update = useResume((state) => state.update)
  const [selectedId, setSelectedId] = useState('')
  const [showOptional, setShowOptional] = useState(false)
  const form = document.form
  const selected = form?.sections.find((section) => section.id === selectedId) ?? form?.sections[0]
  const legacy = form?.sections.find(
    (section) => section.kind === 'custom' && section.title === '原有内容'
  )
  function recognizeAsCopy(): void {
    const source = legacy
      ? legacy.items.map((item) => item.values.details ?? '').join('\n\n')
      : document.markdown
    try {
      const result = recognizeResume(source)
      const structured = parseDocument({
        ...document,
        markdown: source,
        form: result.form,
        editorMode: 'form',
        theme: 'standard'
      })
      useResume.getState().createResume({
        ...document,
        title: (document.title.slice(0, 90) || '简历') + '（表单版）',
        markdown: source,
        form: undefined,
        editorMode: 'markdown'
      })
      useResume.getState().saveSnapshot('识别前原文')
      useResume.getState().update({ ...structured, title: useResume.getState().document.title })
      setSelectedId('')
    } catch (error) {
      onError(error instanceof Error ? error.message : '识别失败')
    }
  }
  function commit(next: ResumeForm): void {
    try {
      update({ form: next, editorMode: 'form' })
    } catch (error) {
      onError(error instanceof Error ? error.message : '更新模块失败')
    }
  }
  function changeSection(id: string, patch: Partial<ResumeSection>): void {
    if (form)
      commit({
        sections: form.sections.map((section) =>
          section.id === id ? { ...section, ...patch } : section
        )
      })
  }
  function moveSection(id: string, step: number): void {
    if (!form) return
    const sections = [...form.sections]
    const index = sections.findIndex((section) => section.id === id)
    const target = index + step
    if (index < 0 || target < 0 || target >= sections.length) return
    ;[sections[index], sections[target]] = [sections[target], sections[index]]
    commit({ sections })
  }
  function moveItem(id: string, step: number): void {
    if (!selected) return
    const items = [...selected.items]
    const index = items.findIndex((item) => item.id === id)
    const target = index + step
    if (index < 0 || target < 0 || target >= items.length) return
    ;[items[index], items[target]] = [items[target], items[index]]
    changeSection(selected.id, { items })
  }
  if (!form || !selected)
    return (
      <div className={styles.start}>
        <h3>按模块填写简历</h3>
        <p>
          选择模块，填写对应字段，自动生成排版。现有 Markdown
          会完整保留在“原有内容”模块中，不会自动猜测或拆分经历。
        </p>
        {document.markdown.trim() && (
          <button disabled={disabled} onClick={recognizeAsCopy}>
            识别为表单（新建副本）
          </button>
        )}
        <button disabled={disabled} onClick={() => commit(createForm(document.markdown))}>
          开始模块配置
        </button>
      </div>
    )
  const definition = definitionFor(selected.kind)
  const index = form.sections.indexOf(selected)
  return (
    <div className={styles.container}>
      <p className={styles.hint}>选择章节编辑，勾选后显示在简历中</p>
      <div className={styles.modules} aria-label="模块选择">
        {form.sections.map((section) => (
          <div key={section.id} className={selected.id === section.id ? styles.selected : ''}>
            <input
              type="checkbox"
              aria-label={`显示${section.title}`}
              disabled={disabled}
              checked={section.enabled}
              onChange={(event) => changeSection(section.id, { enabled: event.target.checked })}
            />
            <button
              disabled={disabled}
              aria-pressed={selected.id === section.id}
              onClick={() => setSelectedId(section.id)}
            >
              {section.title}
            </button>
          </div>
        ))}
      </div>
      <fieldset disabled={disabled} className={styles.fields}>
        {legacy && (
          <div className={styles.importNotice}>
            <p>
              这份简历仍包含整段导入文字。识别为模块后，可分别修改公司、职位、时间等字段；原简历保留。
            </p>
            <button onClick={recognizeAsCopy}>识别为表单（新建副本）</button>
          </div>
        )}
        <div className={styles.sectionHeading}>
          <h3>{selected.title}</h3>
          <div>
            <button disabled={disabled || index === 0} onClick={() => moveSection(selected.id, -1)}>
              模块上移
            </button>
            <button
              disabled={disabled || index === form.sections.length - 1}
              onClick={() => moveSection(selected.id, 1)}
            >
              模块下移
            </button>
          </div>
        </div>
        <details className={styles.fieldOptions}>
          <summary>显示字段</summary>
          <p>取消勾选会隐藏对应输入项和简历内容，已填数据保留。</p>
          <div>
            {definition.fields.map((field) => (
              <label key={field.key}>
                <input
                  type="checkbox"
                  aria-label={`显示字段-${field.key}`}
                  checked={!selected.hiddenFields?.includes(field.key)}
                  onChange={(event) => {
                    const hidden = new Set(selected.hiddenFields ?? [])
                    if (event.target.checked) {
                      hidden.delete(field.key)
                      setShowOptional(true)
                    } else hidden.add(field.key)
                    changeSection(selected.id, { hiddenFields: [...hidden] })
                  }}
                />
                {field.label}
              </label>
            ))}
          </div>
        </details>
        {!selected.enabled && (
          <p className={styles.warning}>
            此模块已隐藏；填写的内容仍会保存，勾选后才显示在预览和 PDF 中。
          </p>
        )}
        <label>
          模块标题
          <input
            aria-label="模块标题"
            maxLength={50}
            value={selected.title}
            onChange={(event) => changeSection(selected.id, { title: event.target.value })}
          />
        </label>
        {selected.kind === 'basic' && (
          <details className={styles.photoDisclosure}>
            <summary>照片设置</summary>
            <AvatarSettings disabled={disabled} onError={onError} />
          </details>
        )}
        {selected.items.map((item, itemIndex) => (
          <div className={styles.item} key={item.id} data-item-id={item.id}>
            <div className={styles.itemHeading}>
              <strong>
                {definition.single ? '' : `经历 ${String(itemIndex + 1).padStart(2, '0')}`}
              </strong>
              {!definition.single && (
                <div className={styles.itemActions}>
                  <button
                    type="button"
                    aria-label={`上移${selected.title}第${itemIndex + 1}条`}
                    disabled={itemIndex === 0}
                    onClick={() => moveItem(item.id, -1)}
                  >
                    上移
                  </button>
                  <button
                    type="button"
                    aria-label={`下移${selected.title}第${itemIndex + 1}条`}
                    disabled={itemIndex === selected.items.length - 1}
                    onClick={() => moveItem(item.id, 1)}
                  >
                    下移
                  </button>
                  <button
                    onClick={() =>
                      changeSection(selected.id, {
                        items: selected.items.filter((entry) => entry.id !== item.id)
                      })
                    }
                  >
                    删除条目
                  </button>
                </div>
              )}
            </div>
            <div className={styles.grid}>
              {definition.fields
                .filter(
                  (field) =>
                    !selected.hiddenFields?.includes(field.key) &&
                    (selected.kind !== 'basic' ||
                      showOptional ||
                      !['age', 'gender', 'birth', 'workYears', 'extra'].includes(field.key))
                )
                .map((field) => (
                  <label key={field.key} className={field.multiline ? styles.wide : ''}>
                    {field.label}
                    {field.multiline ? (
                      <textarea
                        aria-label={`${selected.title}-${field.label}-${itemIndex + 1}`}
                        rows={5}
                        maxLength={selected.kind === 'custom' ? 200_000 : 20_000}
                        value={item.values[field.key] ?? ''}
                        placeholder={field.placeholder}
                        onChange={(event) =>
                          changeSection(selected.id, {
                            items: selected.items.map((entry) =>
                              entry.id === item.id
                                ? {
                                    ...entry,
                                    values: { ...entry.values, [field.key]: event.target.value }
                                  }
                                : entry
                            )
                          })
                        }
                      />
                    ) : (
                      <input
                        aria-label={`${selected.title}-${field.label}-${itemIndex + 1}`}
                        maxLength={500}
                        value={item.values[field.key] ?? ''}
                        placeholder={field.placeholder}
                        onChange={(event) =>
                          changeSection(selected.id, {
                            items: selected.items.map((entry) =>
                              entry.id === item.id
                                ? {
                                    ...entry,
                                    values: { ...entry.values, [field.key]: event.target.value }
                                  }
                                : entry
                            )
                          })
                        }
                      />
                    )}
                  </label>
                ))}
            </div>
          </div>
        ))}
        {selected.kind === 'basic' && (
          <button
            className={styles.moreFields}
            aria-expanded={showOptional}
            onClick={() => setShowOptional(!showOptional)}
          >
            {showOptional ? '收起更多信息' : '更多信息'}
          </button>
        )}
        {!definition.single && (
          <button
            disabled={disabled || selected.items.length >= MAX_SECTION_ITEMS}
            onClick={() => changeSection(selected.id, { items: [...selected.items, createItem()] })}
          >
            ＋ 添加{definition.title}条目
          </button>
        )}
      </fieldset>
    </div>
  )
}
