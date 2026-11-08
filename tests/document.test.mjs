import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadTS } from './load-ts.mjs'
const { parseDocument } = loadTS('src/shared/resume.ts')
const valid = {
  version: 1,
  title: '中文简历',
  markdown: '# 姓名\n\n- 项目经历',
  theme: 'classic',
  fontSize: 13,
  lineHeight: 1.65
}

test('中文简历在 JSON 备份往返后保持内容与样式', () => {
  assert.deepEqual(parseDocument(JSON.parse(JSON.stringify(valid))), valid)
})
test('拒绝未知版本、注入式主题和非法版式数值', () => {
  for (const patch of [
    { version: 2 },
    { theme: '__proto__' },
    { fontSize: NaN },
    { fontSize: 19 },
    { lineHeight: Infinity },
    { lineHeight: 1 }
  ]) {
    assert.throws(() => parseDocument({ ...valid, ...patch }))
  }
})
test('拒绝超大内容和非法 JSON 结构', () => {
  for (const value of [
    null,
    [],
    'text',
    { ...valid, title: 'a'.repeat(101) },
    { ...valid, markdown: '字'.repeat(200001) }
  ]) {
    assert.throws(() => parseDocument(value))
  }
})
test('导入时剥离未知字段，防止文件控制路径和 IPC 行为', () => {
  assert.deepEqual(parseDocument({ ...valid, filePath: '/tmp/other', command: 'run' }), valid)
})

test('头像内嵌备份往返，旧版无头像文档仍保持兼容', () => {
  const avatar = { dataUrl: 'data:image/png;base64,aGVsbG8=', shape: 'circle' }
  assert.deepEqual(parseDocument({ ...valid, avatar }).avatar, avatar)
  assert.equal(parseDocument(valid).avatar, undefined)
  for (const avatar of [
    null,
    { dataUrl: 'https://example.com/photo.png', shape: 'circle' },
    { dataUrl: 'data:image/svg+xml;base64,PHN2Zz4=', shape: 'square' },
    { dataUrl: 'data:image/png;base64,aGVsbG8=', shape: 'invalid' }
  ]) {
    assert.throws(() => parseDocument({ ...valid, avatar }))
  }
})
