import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadTS } from './load-ts.mjs'
const { fragmentsToLines, linesToMarkdown } = loadTS('src/shared/pdf-text.ts')
test('PDF 碎片按坐标组成行，中文相邻字不插入多余空格', () => {
  const item = (str, x, y, width = 10) => ({
    str,
    transform: [1, 0, 0, 1, x, y],
    width,
    height: 10
  })
  assert.deepEqual(
    fragmentsToLines([item('经历', 10, 50), item('同学', 20, 100, 20), item('陈', 10, 100)]),
    ['陈同学', '经历']
  )
  assert.deepEqual(fragmentsToLines([item('React', 10, 50, 30), item('Developer', 50, 50, 50)]), [
    'React Developer'
  ])
})
test('常见章节与列表生成结构，PDF 原文中的 HTML 和 Markdown 特殊符号转义', () => {
  const text = linesToMarkdown([
    ['张同学', '教育背景', '• 软件工程', '<script>alert(1)</script>'],
    ['项目经历', '[链接](javascript:alert(1))']
  ])
  assert.ok(text.startsWith('# 张同学'))
  assert.ok(text.includes('## 教育背景'))
  assert.ok(text.includes('- 软件工程'))
  assert.ok(text.includes('\\<script\\>'))
  assert.ok(text.includes('\\[链接\\]'))
  assert.equal(linesToMarkdown([[], []]), '')
})
