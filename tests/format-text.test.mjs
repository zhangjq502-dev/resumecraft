import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadTS } from './load-ts.mjs'
const { formatSelection } = loadTS('src/shared/format-text.ts')
test('格式操作只改变选区，支持取消且保留中文与相邻内容', () => {
  for (const format of ['bold', 'italic', 'strike']) {
    const result = formatSelection('熟悉 React 开发', 3, 8, format)
    assert.equal(result.text.slice(result.start, result.end), 'React')
    const restored = formatSelection(result.text, result.start, result.end, format)
    assert.deepEqual(restored, { text: '熟悉 React 开发', start: 3, end: 8 })
  }
  assert.deepEqual(formatSelection('中文', 1, 1, 'bold'), { text: '中文', start: 1, end: 1 })
})
