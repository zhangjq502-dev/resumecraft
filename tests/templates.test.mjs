import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadTS } from './load-ts.mjs'
const { RESUME_TEMPLATES, createTemplateDocument } = loadTS('src/shared/templates.ts')
const { parseDocument } = loadTS('src/shared/resume.ts')
const { useResume } = loadTS('src/renderer/src/store/resume.ts')
test('所有模板生成可编辑的结构化文档，并可通过 JSON 往返', () => {
  for (const template of RESUME_TEMPLATES) {
    const doc = parseDocument(createTemplateDocument(template.id))
    assert.equal(doc.theme, template.id)
    assert.equal(doc.editorMode, 'form')
    assert.ok(doc.markdown.includes('你的姓名'))
    assert.deepEqual(parseDocument(JSON.parse(JSON.stringify(doc))), doc)
  }
})
test('切换模板保留字段、内容与头像；从模板新建不覆盖原件', () => {
  useResume.getState().createResume(createTemplateDocument('classic'))
  const before = useResume.getState().document
  const id = useResume.getState().library.activeId
  useResume.getState().update({ theme: 'compact' })
  assert.deepEqual(useResume.getState().document.form, before.form)
  assert.equal(useResume.getState().document.markdown, before.markdown)
  useResume.getState().createResume(createTemplateDocument('modern'))
  useResume.getState().selectResume(id)
  assert.equal(useResume.getState().document.theme, 'compact')
})
