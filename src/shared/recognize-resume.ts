import {
  createForm,
  createItem,
  MAX_SECTION_ITEMS,
  type ResumeForm,
  type ResumeSection
} from './sections'

const aliases: Record<string, string> = {
  教育背景: 'education',
  教育经历: 'education',
  学历背景: 'education',
  工作经历: 'work',
  工作经验: 'work',
  职业经历: 'work',
  项目经历: 'project',
  项目经验: 'project',
  实习经历: 'internship',
  实习经验: 'internship',
  技术能力: 'skills',
  专业技能: 'skills',
  技能特长: 'skills',
  个人技能: 'skills',
  技能清单: 'skills',
  自我评价: 'summary',
  个人简介: 'summary',
  个人优势: 'summary',
  校园经历: 'campus',
  荣誉证书: 'certificates',
  获奖情况: 'certificates',
  兴趣爱好: 'hobbies',
  求职意向: 'intention'
}
const dateRange =
  /(?:19|20)\d{2}[./年-]\d{1,2}(?:月)?\s*(?:—|–|-|~|～|至)\s*(?:(?:19|20)\d{2}[./年-]\d{1,2}(?:月)?|至今|现在|今|Present)/i
const strip = (text: string): string =>
  text
    .replace(/^\s*#{1,6}\s*/, '')
    .replace(/\\([\\`*_[\]<>#!|])/g, '$1')
    .replace(/\*\*/g, '')
    .trim()
const bullet = (text: string): boolean => /^\s*[-*+•●▪]\s+/.test(text)
const linkText = (text: string): string => text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')

/** 规则识别而非模型推断：只提取文本里出现过的值，未识别内容保留在独立模块。 */
export function recognizeResume(markdown: string): {
  form: ResumeForm
  counts: Record<string, number>
  notes: string[]
} {
  const form = createForm()
  for (const section of form.sections) {
    section.enabled = false
    section.items = []
  }
  const get = (kind: string): ResumeSection =>
    form.sections.find((section) => section.kind === kind)!
  const header: string[] = []
  const blocks: { kind: string; title: string; lines: string[] }[] = []
  let current: (typeof blocks)[number] | undefined
  for (const raw of markdown.split(/\r?\n/)) {
    const text = strip(raw)
    const key = text.replace(/^\d+[.、]\s*/, '').replace(/[\s:：]/g, '')
    const kind = aliases[key]
    if (kind) {
      current = { kind, title: text, lines: [] }
      blocks.push(current)
      continue
    }
    if (/^\s*##\s+/.test(raw)) {
      current = { kind: 'custom', title: text, lines: [] }
      blocks.push(current)
      continue
    }
    if (current) current.lines.push(raw)
    else if (raw.trim()) header.push(raw)
  }
  const basic: Record<string, string> = {}
  const intention: Record<string, string> = {}
  const remaining: string[] = []
  for (const raw of header) {
    let text = linkText(strip(raw))
    // 联系方式只从头部提取，避免把项目示例或正文里的号码误当联系方式。
    const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)
    const phone = text.match(/(?:\+?86[ -]?)?1[3-9]\d(?:[ -]?\d){8}/)
    if (email && !basic.email) {
      basic.email = email[0]
      text = text.replace(email[0], '')
    }
    if (phone && !basic.phone) {
      basic.phone = phone[0]
      text = text.replace(phone[0], '')
    }
    const website = text.match(/https?:\/\/[^\s|｜]+/)
    if (website && !basic.website) {
      basic.website = website[0]
      text = text.replace(website[0], '')
    }
    const arrivalText = text.match(/(?:一周|一个月|两周|随时|立即|\d+天)(?:内)?到岗/)
    const job = text.match(/(?:求职意向|意向岗位|应聘岗位)\s*[:：]\s*([^|｜·]+)(?:[|｜·]|$)/)
    if (job) {
      intention.role = job[1]
        .replace(/\s*[—–-]?\s*(?:一周|一个月|两周|随时|立即|\d+天)(?:内)?到岗.*$/, '')
        .trim()
      text = text.replace(job[0], '')
    }
    const arrival = arrivalText
    if (arrival) {
      intention.availability = arrival[0]
      text = text.replace(arrival[0], '')
    }
    text = text
      .replace(/(?:联系电话|联系方式|手机|电话|联系邮箱|邮箱)\s*[:：]?/g, '')
      .replace(/^[\s|｜·—-]+|[\s|｜·—-]+$/g, '')
      .trim()
    if (!text) continue
    if (
      !basic.name &&
      text.length <= 24 &&
      !/[\d@:/]/.test(text) &&
      !/(?:工程师|开发|毕业生|求职|岗位|到岗)/.test(text)
    ) {
      basic.name = text
      continue
    }
    // 明确的性别、经验和城市作为头部字段；无法判断的句子不丢弃。
    const parts = text
      .split(/[|｜·]/)
      .map((value) => value.trim())
      .filter(Boolean)
    for (const part of parts) {
      if (/^\d{1,2}岁$/.test(part)) basic.age = part
      else if (/^\d+(?:-\d+)?(?:元(?:\/月)?|\/月|[kK])$/.test(part)) intention.salary = part
      else if (/^(男|女)$/.test(part)) basic.gender = part
      else if (/^\d+年(?:工作)?经验$/.test(part)) basic.workYears = part
      else if (
        /^(北京|上海|广州|深圳|杭州|成都|武汉|南京|苏州|西安|长沙|重庆|天津|合肥|郑州|厦门)(?:市)?$/.test(
          part
        )
      )
        basic.city = part
      else remaining.push(part)
    }
  }
  if (remaining.length) basic.extra = remaining.join('\n')
  if (Object.keys(basic).length) {
    get('basic').enabled = true
    get('basic').items = [{ ...createItem(), values: basic }]
  }
  if (Object.keys(intention).length) {
    get('intention').enabled = true
    get('intention').items = [{ ...createItem(), values: intention }]
  }

  function description(lines: string[]): string {
    const output: string[] = []
    for (const raw of lines) {
      const text = raw.trim()
      if (!text) continue
      const previous = output[output.length - 1]
      // PDF 自动换行常把一句话拆成独立段落，合并同一条描述的续行。
      if (
        previous &&
        !bullet(text) &&
        !/^#{1,6}\s/.test(text) &&
        !/[。；;.!?：:]$/.test(previous) &&
        !/^[-*+•●▪]\s/.test(text)
      ) {
        output[output.length - 1] +=
          (/[a-z0-9]$/i.test(previous) && /^[a-z0-9]/i.test(text) ? ' ' : '') + text
      } else output.push(text)
    }
    return output.join('\n')
  }
  for (const block of blocks) {
    const lines = block.lines.filter((line) => line.trim())
    if (!lines.length) continue
    if (block.kind === 'custom') {
      if (form.sections.length >= 20) {
        remaining.push(block.title, ...lines)
        continue
      }
      form.sections.push({
        id: crypto.randomUUID(),
        kind: 'custom',
        title: block.title.slice(0, 50) || '待核对内容',
        enabled: true,
        items: [{ ...createItem(), values: { details: lines.join('\n') } }]
      })
      continue
    }
    const section = get(block.kind)
    section.enabled = true
    if (['skills', 'summary', 'hobbies', 'intention'].includes(block.kind)) {
      const values: Record<string, string> =
        block.kind === 'intention'
          ? { role: strip(lines.join(' · ')) }
          : { details: description(lines) }
      if (section.items.length)
        section.items[0].values.details =
          (section.items[0].values.details ?? '') + '\n' + description(lines)
      else section.items = [{ ...createItem(), values }]
      continue
    }
    let entry: Record<string, string> | undefined
    let descriptions: string[] = []
    const flush = (): void => {
      if (!entry && !descriptions.length) return
      if (!entry) entry = {}
      if (descriptions.length) entry.details = description(descriptions)
      if (section.items.length < MAX_SECTION_ITEMS)
        section.items.push({ ...createItem(), values: entry })
      else {
        const last = section.items[section.items.length - 1]
        last.values.details = (last.values.details ?? '') + '\n' + Object.values(entry).join('\n')
      }
      entry = undefined
      descriptions = []
    }
    for (let index = 0; index < lines.length; index++) {
      const raw = lines[index],
        text = strip(raw),
        range = text.match(dateRange)
      const standaloneDate = range && text.replace(range[0], '').trim().length < 3
      const nextText = strip(lines[index + 1] ?? '')
      const nextRange = nextText.match(dateRange)
      const nextIsDate = !!nextRange && nextText.replace(nextRange[0], '').trim().length < 3
      const looksOrganization =
        !bullet(raw) &&
        text.length < 140 &&
        (/(?:公司|大学|学院|学校|工作室|集团)(?:\s*[—–·|｜-]|\s*$)/.test(text) || nextIsDate)
      const explicit = /^\s*###\s+/.test(raw)
      const newEntry =
        explicit ||
        (!standaloneDate && !bullet(raw) && !!range && text.length < 180) ||
        looksOrganization
      if (standaloneDate && entry) {
        entry.period = range[0]
        continue
      }
      if (newEntry) {
        flush()
        entry = {}
        if (range) entry.period = range[0]
        const heading = text
          .replace(dateRange, '')
          .replace(/\s+[—–-]\s*$/, '')
          .trim()
        const parts = heading
          .split(/\s*[—–]\s*|\s+-\s+|\s*[·|｜]\s*/)
          .map((value) => value.trim())
          .filter(Boolean)
        if (block.kind === 'education') {
          entry.school = parts.shift() ?? heading
          const degreeIndex = parts.findIndex((value) =>
            /^(本科|硕士|博士|大专|专科|研究生|学士|MBA|EMBA)$/.test(value)
          )
          if (degreeIndex >= 0) entry.degree = parts.splice(degreeIndex, 1)[0]
          if (parts.length) entry.major = parts.join(' · ')
        } else {
          entry[block.kind === 'work' || block.kind === 'internship' ? 'company' : 'name'] =
            parts.shift() ?? heading
          if (parts.length) entry.role = parts.join(' · ')
        }
        continue
      }
      if (!entry && index === 0 && !bullet(raw) && text.length < 100) {
        entry = {
          [block.kind === 'education'
            ? 'school'
            : block.kind === 'work' || block.kind === 'internship'
              ? 'company'
              : 'name']: text
        }
        continue
      }
      const stack = text.match(/^技术栈\s*[:：]\s*(.+)$/)
      const projectLink = text.match(/^(?:在线演示|项目链接|演示地址|GitHub)\s*[:：]\s*(.+)$/i)
      if (block.kind === 'project' && entry && stack) {
        entry.stack = stack[1]
        continue
      }
      if (block.kind === 'project' && entry && projectLink) {
        entry.link = projectLink[1]
        continue
      }
      descriptions.push(raw)
    }
    flush()
  }
  for (const section of form.sections) if (!section.items.length) section.items = [createItem()]
  const counts: Record<string, number> = {}
  for (const section of form.sections)
    if (section.enabled) counts[section.title] = section.items.length
  return {
    form,
    counts,
    notes: [
      '规则识别结果需要核对。无法确定的内容保留在其他信息、详细描述或自定义模块中。',
      '原文会作为历史快照保留；已有简历转换时创建独立副本，不覆盖原件。'
    ]
  }
}
