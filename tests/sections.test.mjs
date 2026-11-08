import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadTS } from './load-ts.mjs'
const { createForm, parseForm, formToMarkdown } = loadTS('src/shared/sections.ts')
const { parseDocument } = loadTS('src/shared/resume.ts')
const { createLibrary, addSnapshot, restoreSnapshot } = loadTS('src/shared/library.ts')
const doc = {
  version: 1,
  title: '表单测试',
  markdown: '旧内容',
  theme: 'classic',
  fontSize: 13,
  lineHeight: 1.65
}

test('已有 Markdown 不做破坏性反向解析，保留为原有内容模块', () => {
  const markdown = '# 姓名\n\n## 自定义经历\n- 原始列表'
  assert.equal(formToMarkdown(parseForm(createForm(markdown))), markdown)
  assert.equal(formToMarkdown(parseForm(createForm('a'.repeat(200000)))), 'a'.repeat(200000))
})
test('字段生成预览、空模块省略、隐藏保留内容，排序决定输出顺序', () => {
  const form = createForm()
  const basic = form.sections.find((section) => section.kind === 'basic')
  basic.items[0].values = { name: '测试姓名', phone: '13800000000' }
  const education = form.sections.find((section) => section.kind === 'education')
  education.items[0].values = { school: '测试大学', major: '计算机', details: '- 课程' }
  const project = form.sections.find((section) => section.kind === 'project')
  project.items[0].values = { name: '测试项目' }
  const text = formToMarkdown(form)
  assert.ok(text.includes('# 测试姓名'))
  assert.ok(!text.includes('## 技术能力'))
  education.enabled = false
  assert.ok(!formToMarkdown(form).includes('测试大学'))
  assert.equal(education.items[0].values.school, '测试大学')
  education.enabled = true
  form.sections = [project, ...form.sections.filter((section) => section !== project)]
  assert.ok(formToMarkdown(form).indexOf('测试项目') < formToMarkdown(form).indexOf('测试大学'))
})
test('表单文档以结构化配置生成 Markdown，备份往返保留配置', () => {
  const form = createForm()
  form.sections[0].items[0].values = { name: '新姓名' }
  const parsed = parseDocument({ ...doc, form, editorMode: 'form' })
  assert.equal(parsed.markdown, '# 新姓名')
  assert.deepEqual(parseDocument(JSON.parse(JSON.stringify(parsed))), parsed)
  assert.throws(() => parseDocument({ ...doc, editorMode: 'form' }))
  const malicious = structuredClone(form)
  malicious.sections[0].kind = 'unknown'
  assert.throws(() => parseForm(malicious))
  malicious.sections[0].kind = 'basic'
  malicious.sections[1].id = malicious.sections[0].id
  assert.throws(() => parseForm(malicious))
})
test('隐藏字段变化也能生成快照，恢复同时还原模块配置', () => {
  const form = createForm()
  const work = form.sections.find((section) => section.kind === 'work')
  work.enabled = false
  work.items[0].values = { company: '旧公司' }
  let entry = addSnapshot(
    createLibrary(parseDocument({ ...doc, form, editorMode: 'form' })).entries[0],
    '原版'
  )
  const target = entry.snapshots[0].id
  const changed = structuredClone(entry.document)
  changed.form.sections.find((section) => section.kind === 'work').items[0].values.company =
    '新公司'
  entry = addSnapshot({ ...entry, document: changed }, '隐藏字段更新')
  assert.equal(entry.snapshots.length, 2)
  assert.equal(
    restoreSnapshot(entry, target).document.form.sections.find((section) => section.kind === 'work')
      .items[0].values.company,
    '旧公司'
  )
})
