import { useRef, useState, type ReactNode } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ResumeDocument } from '../../../shared/resume'
import { definitionFor, visibleValues, type ResumeSection } from '../../../shared/sections'
import { useResume } from '../store/resume'
import { formatSelection, type TextFormat } from '../../../shared/format-text'
import styles from './EditableResume.module.scss'

export function SafeMarkdown({ text }: { text: string }): React.JSX.Element {
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      skipHtml
      disallowedElements={['img']}
      components={{
        a: ({ href, children }) => (
          <a
            href={href || undefined}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => event.stopPropagation()}
          >
            {children}
          </a>
        )
      }}
    >
      {text}
    </Markdown>
  )
}
/** 点击原位输入，每次输入立即更新 store；PDF 只显示对应的纯文本，排除编辑控件。 */
function InlineField({
  value,
  label,
  field,
  multiline = false,
  disabled,
  onChange
}: {
  value: string
  label: string
  field: string
  multiline?: boolean
  disabled: boolean
  onChange: (text: string) => void
}): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  const beforeEdit = useRef('')
  const textarea = useRef<HTMLTextAreaElement>(null)
  function applyFormat(format: TextFormat): void {
    const input = textarea.current
    if (!input) return
    const next = formatSelection(value, input.selectionStart, input.selectionEnd, format)
    onChange(next.text)
    requestAnimationFrame(() => {
      input.focus()
      input.setSelectionRange(next.start, next.end)
    })
  }
  const start = (): void => {
    if (!disabled) {
      beforeEdit.current = value
      setEditing(true)
    }
  }
  const keyboard = (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>): void => {
    if (
      multiline &&
      (event.metaKey || event.ctrlKey) &&
      ['b', 'i'].includes(event.key.toLowerCase())
    ) {
      event.preventDefault()
      applyFormat(event.key.toLowerCase() === 'b' ? 'bold' : 'italic')
      return
    }
    if (event.key === 'Escape') {
      onChange(beforeEdit.current)
      setEditing(false)
      event.stopPropagation()
    }
    if (
      event.key === 'Enter' &&
      (!multiline || event.metaKey || event.ctrlKey) &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault()
      setEditing(false)
    }
  }
  const content: ReactNode = multiline ? <SafeMarkdown text={value} /> : value
  const Wrapper = multiline ? 'div' : 'span'
  return (
    <Wrapper
      className={`${styles.field} ${multiline ? styles.multiline : ''} ${!value ? styles.empty : ''}`}
      data-field={field}
    >
      {editing && !disabled ? (
        <>
          {multiline ? (
            <div className={styles.richEditor}>
              <div className={styles.formatBar} role="toolbar" aria-label="文字格式">
                {(
                  [
                    ['bold', '加粗', 'B'],
                    ['italic', '斜体', 'I'],
                    ['strike', '删除线', 'S']
                  ] as const
                ).map(([format, name, glyph]) => (
                  <button
                    key={format}
                    type="button"
                    aria-label={name}
                    title={name}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => applyFormat(format)}
                  >
                    {glyph}
                  </button>
                ))}
                <span>选中文字设置格式</span>
                <button type="button" onClick={() => setEditing(false)}>
                  完成
                </button>
              </div>
              <textarea
                ref={textarea}
                className={styles.control}
                aria-label={`编辑${label}`}
                autoFocus
                rows={5}
                maxLength={200000}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                onBlur={(event) => {
                  if (!event.currentTarget.parentElement?.contains(event.relatedTarget))
                    setEditing(false)
                }}
                onKeyDown={keyboard}
              />
            </div>
          ) : (
            <input
              className={styles.control}
              aria-label={`编辑${label}`}
              autoFocus
              maxLength={500}
              value={value}
              onChange={(event) => onChange(event.target.value)}
              onBlur={() => setEditing(false)}
              onKeyDown={keyboard}
            />
          )}
          <Wrapper className={styles.printValue}>{content}</Wrapper>
        </>
      ) : (
        <Wrapper
          className={disabled ? '' : styles.clickable}
          role={disabled ? undefined : 'button'}
          tabIndex={disabled ? undefined : 0}
          aria-label={`修改${label}`}
          onClick={start}
          onKeyDown={(event) => {
            if (
              event.target === event.currentTarget &&
              (event.key === 'Enter' || event.key === ' ')
            ) {
              event.preventDefault()
              start()
            }
          }}
          title={disabled ? undefined : `点击修改${label}`}
        >
          {value ? content : <span className={styles.placeholder}>{label}</span>}
        </Wrapper>
      )}
    </Wrapper>
  )
}

export function EditableResume({
  document,
  disabled,
  onError
}: {
  document: ResumeDocument
  disabled: boolean
  onError: (message: string) => void
}): React.JSX.Element {
  const update = useResume((state) => state.update)
  function changeField(sectionId: string, itemId: string, key: string, value: string): void {
    // 使用最新状态，防止延后的预览捕获旧数据并覆盖其他输入。
    const current = useResume.getState().document
    if (!current.form || current.editorMode !== 'form') return
    try {
      update({
        form: {
          sections: current.form.sections.map((section) =>
            section.id === sectionId
              ? {
                  ...section,
                  items: section.items.map((item) =>
                    item.id === itemId
                      ? { ...item, values: { ...item.values, [key]: value } }
                      : item
                  )
                }
              : section
          )
        }
      })
    } catch (error) {
      onError(error instanceof Error ? error.message : '修改失败')
    }
  }
  function changeTitle(id: string, title: string): void {
    const current = useResume.getState().document
    if (!current.form) return
    try {
      update({
        form: {
          sections: current.form.sections.map((section) =>
            section.id === id ? { ...section, title: title.slice(0, 50) } : section
          )
        }
      })
    } catch (error) {
      onError(error instanceof Error ? error.message : '修改失败')
    }
  }
  if (!document.form || document.editorMode !== 'form')
    return (
      <InlineField
        value={document.markdown}
        label="Markdown 内容"
        field="markdown"
        multiline
        disabled={disabled}
        onChange={(markdown) => {
          try {
            update({ markdown, editorMode: 'markdown' })
          } catch (error) {
            onError(error instanceof Error ? error.message : '修改失败')
          }
        }}
      />
    )
  function renderItem(
    section: ResumeSection,
    item: ResumeSection['items'][number]
  ): React.JSX.Element {
    const definition = definitionFor(section.kind)
    const field = (key: string): React.JSX.Element =>
      section.hiddenFields?.includes(key) ? (
        <></>
      ) : (
        <InlineField
          key={key}
          value={item.values[key] ?? ''}
          label={definition.fields.find((entry) => entry.key === key)?.label ?? key}
          field={key}
          multiline={definition.fields.find((entry) => entry.key === key)?.multiline}
          disabled={disabled}
          onChange={(text) => changeField(section.id, item.id, key, text)}
        />
      )
    const values = visibleValues(section, item)
    const filled = Object.values(values).some((value) => value.trim())
    if (section.kind === 'custom' && section.title === '原有内容')
      return <div key={item.id}>{field('details')}</div>
    if (section.kind === 'basic')
      return (
        <div key={item.id} className={`${styles.basic} ${!filled ? styles.emptyBlock : ''}`}>
          <h1>{field('name')}</h1>
          <p className={styles.contact} data-contact="main">
            {['phone', 'email', 'city', 'website'].filter((key) => values[key]).map(field)}
          </p>
          {['age', 'gender', 'birth', 'workYears'].some((key) => values[key]) && (
            <p className={styles.contact} data-contact="extra">
              {['age', 'gender', 'birth', 'workYears'].filter((key) => values[key]).map(field)}
            </p>
          )}
          {values.extra && field('extra')}
        </div>
      )
    if (section.kind === 'intention')
      return (
        <p
          key={item.id}
          data-contact="intention"
          className={`${styles.contact} ${!filled ? styles.emptyBlock : ''}`}
        >
          {definition.fields
            .filter((entry) => values[entry.key] || (!filled && entry.key === 'role'))
            .map((entry) => (
              <span key={entry.key}>
                {entry.key === 'role' && '求职意向：'}
                {field(entry.key)}
              </span>
            ))}
        </p>
      )
    const headingFields = definition.fields.filter(
      (entry) =>
        !['details', 'period', 'stack', 'link'].includes(entry.key) &&
        !section.hiddenFields?.includes(entry.key) &&
        (values[entry.key]?.trim() || !filled)
    )
    return (
      <div key={item.id} className={`${styles.item} ${!filled ? styles.emptyBlock : ''}`}>
        <div className={styles.itemHeader}>
          {!!headingFields.length && (
            <h3 className={styles.itemTitle}>{headingFields.map((entry) => field(entry.key))}</h3>
          )}
          {definition.fields.some((entry) => entry.key === 'period') &&
            !section.hiddenFields?.includes('period') &&
            (values.period || !filled) && <p className={styles.period}>{field('period')}</p>}
        </div>
        {values.stack && <p>{field('stack')}</p>}
        {values.link && <p>{field('link')}</p>}
        {(values.details || !filled) && field('details')}
      </div>
    )
  }
  const sections =
    document.theme === 'standard'
      ? [
          ...document.form.sections.filter((section) =>
            ['basic', 'intention'].includes(section.kind)
          ),
          ...document.form.sections.filter(
            (section) => !['basic', 'intention'].includes(section.kind)
          )
        ]
      : document.form.sections
  const renderSections = (selectedSections: ResumeSection[]): React.JSX.Element => (
    <>
      {selectedSections
        .filter((section) => section.enabled)
        .map((section) => {
          const hasContent = section.items.some((item) =>
            Object.values(visibleValues(section, item)).some((value) => value.trim())
          )
          const isHeader = ['basic', 'intention'].includes(section.kind)
          const legacy = section.kind === 'custom' && section.title === '原有内容'
          return (
            <section
              key={section.id}
              data-section={legacy ? 'legacy' : section.kind}
              className={`${!isHeader && !legacy ? styles.section : ''} ${!hasContent ? styles.emptyBlock : ''}`}
            >
              {!isHeader && !legacy && (
                <h2>
                  <InlineField
                    value={section.title}
                    label="模块标题"
                    field="section-title"
                    disabled={disabled}
                    onChange={(title) => changeTitle(section.id, title)}
                  />
                </h2>
              )}
              <div className={styles.sectionBody}>
                {(hasContent
                  ? section.items.filter((item) =>
                      Object.values(visibleValues(section, item)).some((value) => value.trim())
                    )
                  : section.items.slice(0, 1)
                ).map((item) => renderItem(section, item))}
              </div>
            </section>
          )
        })}
    </>
  )
  return document.theme === 'standard' ? (
    <>
      <div className={styles.headerGroup}>
        {renderSections(
          sections.filter((section) => ['basic', 'intention'].includes(section.kind))
        )}
      </div>
      {renderSections(sections.filter((section) => !['basic', 'intention'].includes(section.kind)))}
    </>
  ) : (
    renderSections(sections)
  )
}
