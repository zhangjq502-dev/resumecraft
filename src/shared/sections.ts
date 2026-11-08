/** 表单字段配置与渲染规则集中维护，UI 和 Markdown 生成使用同一数据源。 */
export interface FieldDefinition {
  key: string
  label: string
  multiline?: boolean
  placeholder?: string
}
export interface SectionDefinition {
  kind: string
  title: string
  single?: boolean
  fields: FieldDefinition[]
}
const details: FieldDefinition = {
  key: 'details',
  label: '详细描述',
  multiline: true,
  placeholder: '支持 Markdown 列表，每行描述一项经历或成果'
}
const period: FieldDefinition = {
  key: 'period',
  label: '起止时间',
  placeholder: '例如：2022.09 — 2026.06 / 至今'
}
export const SECTION_DEFINITIONS: SectionDefinition[] = [
  {
    kind: 'basic',
    title: '基本信息',
    single: true,
    fields: [
      { key: 'name', label: '姓名' },
      { key: 'phone', label: '联系电话' },
      { key: 'email', label: '联系邮箱' },
      { key: 'city', label: '所在城市' },
      { key: 'website', label: '个人主页 / GitHub' },
      { key: 'age', label: '年龄（选填）' },
      { key: 'gender', label: '性别（选填）' },
      { key: 'birth', label: '出生年月（选填）' },
      { key: 'workYears', label: '工作年限' },
      { key: 'extra', label: '其他信息', multiline: true }
    ]
  },
  {
    kind: 'intention',
    title: '求职意向',
    single: true,
    fields: [
      { key: 'role', label: '目标岗位' },
      { key: 'city', label: '期望城市' },
      { key: 'salary', label: '期望薪资' },
      { key: 'availability', label: '到岗时间' }
    ]
  },
  {
    kind: 'education',
    title: '教育背景',
    fields: [
      { key: 'school', label: '学校名称' },
      { key: 'major', label: '专业' },
      { key: 'degree', label: '学历' },
      period,
      details
    ]
  },
  {
    kind: 'work',
    title: '工作经历',
    fields: [{ key: 'company', label: '公司名称' }, { key: 'role', label: '职位' }, period, details]
  },
  {
    kind: 'project',
    title: '项目经历',
    fields: [
      { key: 'name', label: '项目名称' },
      { key: 'role', label: '担任角色' },
      { key: 'stack', label: '技术栈' },
      { key: 'link', label: '项目链接' },
      period,
      details
    ]
  },
  { kind: 'skills', title: '技术能力', single: true, fields: [details] },
  { kind: 'summary', title: '自我评价', single: true, fields: [details] },
  {
    kind: 'internship',
    title: '实习经历',
    fields: [
      { key: 'company', label: '公司名称' },
      { key: 'role', label: '实习岗位' },
      period,
      details
    ]
  },
  {
    kind: 'campus',
    title: '校园经历',
    fields: [
      { key: 'name', label: '组织 / 活动' },
      { key: 'role', label: '担任角色' },
      period,
      details
    ]
  },
  {
    kind: 'certificates',
    title: '荣誉证书',
    fields: [
      { key: 'name', label: '证书 / 奖项名称' },
      { key: 'period', label: '获得时间' },
      details
    ]
  },
  { kind: 'hobbies', title: '兴趣爱好', single: true, fields: [details] },
  { kind: 'custom', title: '自定义模块', fields: [{ key: 'name', label: '条目名称' }, details] }
]
export interface SectionItem {
  id: string
  values: Record<string, string>
}
export interface ResumeSection {
  id: string
  kind: string
  title: string
  enabled: boolean
  items: SectionItem[]
  hiddenFields?: string[]
}
export interface ResumeForm {
  sections: ResumeSection[]
}
export const MAX_SECTION_ITEMS = 20
export function definitionFor(kind: string): SectionDefinition {
  const definition = SECTION_DEFINITIONS.find((entry) => entry.kind === kind)
  if (!definition) throw new Error('未知简历模块')
  return definition
}
export function createItem(): SectionItem {
  return { id: crypto.randomUUID(), values: {} }
}
/** 不猜测任意 Markdown 的语义：原文放入独立的自定义模块，用户可以逐步搬入字段。 */
export function createForm(markdown = ''): ResumeForm {
  const sections = SECTION_DEFINITIONS.map((definition): ResumeSection => ({
    id: crypto.randomUUID(),
    kind: definition.kind,
    title: definition.title,
    enabled:
      !markdown.trim() &&
      ['basic', 'intention', 'education', 'project', 'skills'].includes(definition.kind),
    items: [createItem()]
  }))
  if (markdown.trim())
    sections.push({
      id: crypto.randomUUID(),
      kind: 'custom',
      title: '原有内容',
      enabled: true,
      items: [{ id: crypto.randomUUID(), values: { details: markdown } }]
    })
  return { sections }
}
export function parseForm(value: unknown): ResumeForm {
  if (!value || typeof value !== 'object' || !Array.isArray((value as ResumeForm).sections))
    throw new Error('无效的模块配置')
  const input = (value as ResumeForm).sections
  if (input.length < 1 || input.length > 20) throw new Error('模块数量应为 1–20')
  let totalTextLength = 0
  const ids = new Set<string>()
  const checkId = (id: unknown): string => {
    if (typeof id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(id) || ids.has(id))
      throw new Error('模块或条目 ID 无效或重复')
    ids.add(id)
    return id
  }
  return {
    sections: input.map((section) => {
      if (!section || typeof section !== 'object') throw new Error('无效模块')
      const definition = definitionFor(section.kind)
      if (
        typeof section.title !== 'string' ||
        section.title.length > 50 ||
        typeof section.enabled !== 'boolean'
      )
        throw new Error('模块名称或状态无效')
      if (
        !Array.isArray(section.items) ||
        section.items.length > MAX_SECTION_ITEMS ||
        (definition.single && section.items.length > 1)
      )
        throw new Error('模块条目数量超限')
      if (
        section.hiddenFields !== undefined &&
        (!Array.isArray(section.hiddenFields) ||
          section.hiddenFields.some(
            (key) =>
              typeof key !== 'string' || !definition.fields.some((field) => field.key === key)
          ))
      )
        throw new Error('隐藏字段配置无效')
      const id = checkId(section.id)
      return {
        id,
        kind: definition.kind,
        title: section.title,
        enabled: section.enabled,
        ...(section.hiddenFields ? { hiddenFields: [...new Set(section.hiddenFields)] } : {}),
        items: section.items.map((item) => {
          if (
            !item ||
            typeof item !== 'object' ||
            !item.values ||
            typeof item.values !== 'object' ||
            Array.isArray(item.values)
          )
            throw new Error('无效条目')
          const values: Record<string, string> = {}
          for (const field of definition.fields) {
            const text = item.values[field.key]
            if (text === undefined) continue
            if (
              typeof text !== 'string' ||
              text.length > (field.multiline ? (section.kind === 'custom' ? 200_000 : 20_000) : 500)
            )
              throw new Error(`${field.label}内容过长或格式错误`)
            totalTextLength += text.length
            if (totalTextLength > 200_000)
              throw new Error('模块文本总量最多 200,000 字符（含隐藏内容）')
            values[field.key] = text
          }
          return { id: checkId(item.id), values }
        })
      }
    })
  }
}
/** 单行字段按纯文本处理，描述字段允许 Markdown。空模块不输出标题。 */
function plain(text = ''): string {
  return text
    .trim()
    .replace(/\n/g, ' ')
    .replace(/[\\`*_[\]<>#!|]/g, '\\$&')
}
export function formToMarkdown(form: ResumeForm): string {
  return form.sections
    .filter((section) => section.enabled)
    .map((section) => {
      const bodies = section.items
        .map((item) => {
          const v = visibleValues(section, item)
          if (!Object.values(v).some((text) => text.trim())) return ''
          if (section.kind === 'basic')
            return [
              v.name?.trim() ? '# ' + plain(v.name) : '',
              [v.phone, v.email, v.city, v.website]
                .filter(Boolean)
                .map((text) => plain(text))
                .join(' · '),
              [v.age, v.gender, v.birth, v.workYears]
                .filter(Boolean)
                .map((text) => plain(text))
                .join(' · '),
              v.extra?.trim()
            ]
              .filter(Boolean)
              .join('\n\n')
          if (section.kind === 'intention')
            return [
              v.role && `求职意向：${plain(v.role)}`,
              v.city && `期望城市：${plain(v.city)}`,
              v.salary && `期望薪资：${plain(v.salary)}`,
              v.availability && `到岗时间：${plain(v.availability)}`
            ]
              .filter(Boolean)
              .join(' · ')
          const heading = [v.school || v.company || v.name, v.major, v.degree, v.role]
            .filter(Boolean)
            .map((text) => plain(text))
            .join(' · ')
          return [
            heading && `### ${heading}`,
            v.period && plain(v.period),
            v.stack && plain(v.stack),
            v.link && plain(v.link),
            v.details?.trim()
          ]
            .filter(Boolean)
            .join('\n\n')
        })
        .filter(Boolean)
      if (!bodies.length) return ''
      // 旧 Markdown 原文已有自己的标题，不再追加“原有内容”的标题。
      const showTitle =
        !['basic', 'intention'].includes(section.kind) &&
        !(section.kind === 'custom' && section.title === '原有内容')
      return [showTitle && `## ${plain(section.title)}`, ...bodies].filter(Boolean).join('\n\n')
    })
    .filter(Boolean)
    .join('\n\n')
}

/** 隐藏只影响表单和输出，不删除原始值，恢复显示后可继续使用。 */
export function visibleValues(section: ResumeSection, item: SectionItem): Record<string, string> {
  return Object.fromEntries(
    Object.entries(item.values).filter(([key]) => !section.hiddenFields?.includes(key))
  )
}
