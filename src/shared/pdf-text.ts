export interface PDFTextFragment {
  str: string
  transform: number[]
  width: number
  height: number
}
/** 按行坐标组织碎片；复杂双栏仍需要用户核对，不推断跨栏语义。 */
export function fragmentsToLines(fragments: PDFTextFragment[]): string[] {
  const sorted = fragments
    .filter(
      (item) =>
        item.str.trim() &&
        item.transform.length >= 6 &&
        Number.isFinite(item.transform[4]) &&
        Number.isFinite(item.transform[5])
    )
    .sort((a, b) => b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4])
  const lines: { y: number; fragments: PDFTextFragment[] }[] = []
  for (const fragment of sorted) {
    const last = lines[lines.length - 1]
    if (last && Math.abs(last.y - fragment.transform[5]) <= 2) last.fragments.push(fragment)
    else lines.push({ y: fragment.transform[5], fragments: [fragment] })
  }
  return lines
    .map((line) => {
      const items = line.fragments.sort((a, b) => a.transform[4] - b.transform[4])
      return items
        .map((item, index) => {
          const previous = items[index - 1]
          const gap = previous ? item.transform[4] - (previous.transform[4] + previous.width) : 0
          return (previous && gap > Math.max(1.5, item.height * 0.15) ? ' ' : '') + item.str
        })
        .join('')
        .replace(/\s+/g, ' ')
        .trim()
    })
    .filter(Boolean)
}
const headings = new Set([
  '教育背景',
  '教育经历',
  '工作经历',
  '工作经验',
  '项目经历',
  '项目经验',
  '专业技能',
  '技术能力',
  '个人技能',
  '实习经历',
  '个人简介',
  '自我评价',
  '校园经历',
  '荣誉证书',
  '兴趣爱好'
])
function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_[\]<>#!|]/g, '\\$&')
}
/** PDF 文本不直接当作 HTML/Markdown 执行，只为常见章节与项目符号添加结构。 */
export function linesToMarkdown(pages: string[][]): string {
  let first = true
  return pages
    .map((lines) =>
      lines
        .map((line) => {
          const text = line.trim()
          if (!text) return ''
          if (first) {
            first = false
            return (text.length <= 40 ? '# ' : '') + escapeMarkdown(text)
          }
          if (headings.has(text.replace(/\s/g, ''))) return '## ' + escapeMarkdown(text)
          if (/^[•●▪·]\s*/.test(text)) return '- ' + escapeMarkdown(text.replace(/^[•●▪·]\s*/, ''))
          return escapeMarkdown(text)
        })
        .filter(Boolean)
        .join('\n\n')
    )
    .filter(Boolean)
    .join('\n\n')
}
