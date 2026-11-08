import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadTS } from './load-ts.mjs'
const { recognizeResume } = loadTS('src/shared/recognize-resume.ts')
const { parseDocument } = loadTS('src/shared/resume.ts')
const { parseForm, formToMarkdown } = loadTS('src/shared/sections.ts')
const source = `# 张同学
求职意向：前端开发工程师 | 一周内到岗
15010000000 | zhang@example.com
## 教育背景
示例大学 - 通信工程 - 本科 2018.09 - 2022.06
专业成绩：GPA 3.6
## 工作经历
广州示例计算机有限公司 — 前端开发工程师 2025.03 — 2026.08
- 负责核心模块迭代，处理连接稳定
性及长列表渲染问题。
深圳示例软件开发公司 — ERP开发工程师 2024.03 — 2024.07
- 负责表单开发。
## 项目经历
OTC交易App（个人项目） — 前端开发 2026.07 — 至今
项目简介：交易应用
技术栈：Vue 3 + TypeScript
在线演示：https://example.com
- 实现订单状态流转。
## 技能特长
- JavaScript / TypeScript
## 其他贡献
保留这段无法归类的真实内容。
`
test('导入文字识别为基本信息、教育、多个公司与项目字段，并保留未知内容', () => {
  const { form } = recognizeResume(source)
  parseForm(form)
  const values = (kind) => form.sections.find((section) => section.kind === kind)
  assert.equal(values('basic').items[0].values.name, '张同学')
  assert.equal(values('basic').items[0].values.phone, '15010000000')
  assert.equal(values('basic').items[0].values.email, 'zhang@example.com')
  assert.equal(values('intention').items[0].values.role, '前端开发工程师')
  assert.equal(values('intention').items[0].values.availability, '一周内到岗')
  assert.equal(values('education').items[0].values.school, '示例大学')
  assert.equal(values('education').items[0].values.degree, '本科')
  assert.equal(values('work').items.length, 2)
  assert.equal(values('work').items[0].values.role, '前端开发工程师')
  assert.ok(values('work').items[0].values.details.includes('稳定性及长列表'))
  assert.equal(values('project').items[0].values.stack, 'Vue 3 + TypeScript')
  assert.equal(values('project').items[0].values.link, 'https://example.com')
  assert.ok(formToMarkdown(form).includes('无法归类的真实内容'))
})
test('隐藏字段同时从生成内容中排除，原值与备份仍保留，恢复显示后重新出现', () => {
  const { form } = recognizeResume(source)
  const basic = form.sections.find((section) => section.kind === 'basic')
  basic.hiddenFields = ['phone', 'email']
  const parsed = parseForm(form)
  assert.ok(!formToMarkdown(parsed).includes('15010000000'))
  assert.ok(!formToMarkdown(parsed).includes('zhang@example.com'))
  assert.equal(
    parsed.sections.find((section) => section.kind === 'basic').items[0].values.phone,
    '15010000000'
  )
  assert.deepEqual(parseForm(JSON.parse(JSON.stringify(parsed))), parsed)
  basic.hiddenFields = []
  assert.ok(formToMarkdown(form).includes('15010000000'))
  basic.hiddenFields = ['invalid-field']
  assert.throws(() => parseForm(form))
})
test('标准中文与自定义色可持久化，拒绝非法样式值', () => {
  const form = recognizeResume(source).form
  const document = parseDocument({
    version: 1,
    title: '测试',
    markdown: '',
    theme: 'standard',
    accentColor: '#273e5c',
    fontSize: 13,
    lineHeight: 1.65,
    form,
    editorMode: 'form'
  })
  assert.deepEqual(parseDocument(JSON.parse(JSON.stringify(document))), document)
  assert.throws(() => parseDocument({ ...document, accentColor: 'url(https://example.com)' }))
})
