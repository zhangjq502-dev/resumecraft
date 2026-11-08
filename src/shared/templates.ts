import type { ResumeDocument, Theme } from './resume'
import { createForm } from './sections'

export const RESUME_TEMPLATES: { id: Theme; name: string; description: string }[] = [
  { id: 'standard', name: '标准中文', description: '居中姓名、黑色分隔线，经历日期右对齐。' },
  { id: 'classic', name: '经典单栏', description: '左对齐标题、清晰分隔，适合通用求职。' },
  { id: 'modern', name: '分栏章节', description: '表单章节与正文分列，层次明确。' },
  { id: 'minimal', name: '简约居中', description: '姓名与联系方式居中，正文留白舒展。' },
  { id: 'compact', name: '紧凑专业', description: '较紧凑的章节间距，适合经历较多的简历。' }
]

/** 模板只提供样式与可替换的示例内容，不承载独立的用户数据。 */
export function createTemplateDocument(theme: Theme): ResumeDocument {
  const form = createForm()
  const set = (kind: string, values: Record<string, string>): void => {
    const section = form.sections.find((item) => item.kind === kind)!
    section.enabled = true
    section.items[0].values = values
  }
  set('basic', {
    name: '你的姓名',
    phone: '138 0000 0000',
    email: 'hello@example.com',
    city: '所在城市'
  })
  set('intention', { role: '目标岗位', availability: '到岗时间' })
  set('education', {
    school: '学校名称',
    major: '专业名称',
    degree: '学历',
    period: '2022.09 — 2026.06',
    details: '- 填写相关课程、成绩或校园成果。'
  })
  set('project', {
    name: '项目名称',
    role: '你的角色',
    stack: '技术栈 / 使用工具',
    period: '项目时间',
    details:
      '- 描述项目解决的问题，以及你的具体行动。\n- 填写能够验证的结果，不使用未经测量的数据。'
  })
  set('skills', { details: '- 填写与目标岗位相关的技能及掌握程度。' })
  return {
    version: 1,
    title: '新简历',
    markdown: '',
    form,
    editorMode: 'form',
    theme,
    fontSize: 15,
    lineHeight: 1.55
  }
}
