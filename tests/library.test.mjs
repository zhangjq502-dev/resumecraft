import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadTS } from './load-ts.mjs'
const { createLibrary, parseLibrary, addSnapshot, restoreSnapshot, compareLines } =
  loadTS('src/shared/library.ts')
const { LibraryStorage } = loadTS('src/main/library-storage.ts')
const { useResume } = loadTS('src/renderer/src/store/resume.ts')
const doc = {
  version: 1,
  title: '测试简历',
  markdown: '# 初稿',
  theme: 'classic',
  fontSize: 13,
  lineHeight: 1.65
}

test('新建、复制、切换保持内容独立，重命名仅影响当前简历', () => {
  useResume.getState().hydrate(createLibrary(doc))
  const first = useResume.getState().library.activeId
  useResume.getState().duplicateResume()
  const second = useResume.getState().library.activeId
  assert.notEqual(first, second)
  useResume.getState().update({ title: '副本', markdown: '# 新内容' })
  useResume.getState().selectResume(first)
  assert.deepEqual(useResume.getState().document, doc)
  useResume.getState().selectResume(second)
  assert.equal(useResume.getState().document.title, '副本')
  useResume.getState().deleteResume()
  assert.equal(useResume.getState().library.activeId, first)
  assert.throws(() => useResume.getState().deleteResume())
})
test('相邻快照去重，恢复前保留当前内容，历史最多 20 份', () => {
  let entry = createLibrary(doc).entries[0]
  entry = addSnapshot(entry, '初稿')
  assert.equal(addSnapshot(entry, '重复'), entry)
  const targetId = entry.snapshots[0].id
  entry = { ...entry, document: { ...doc, markdown: '# 新内容' } }
  entry = restoreSnapshot(entry, targetId)
  assert.equal(entry.document.markdown, '# 初稿')
  assert.equal(entry.snapshots[0].document.markdown, '# 新内容')
  for (let i = 0; i < 25; i++)
    entry = addSnapshot({ ...entry, document: { ...doc, markdown: `# 第 ${i} 稿` } }, String(i))
  assert.equal(entry.snapshots.length, 20)
  assert.throws(() => restoreSnapshot(entry, 'missing'))
})
test('库验证拒绝重复 ID、悬空选中项和未知版本', () => {
  const library = createLibrary(doc)
  assert.deepEqual(parseLibrary(library), library)
  assert.throws(() => parseLibrary({ ...library, activeId: 'missing' }))
  assert.throws(() =>
    parseLibrary({ ...library, entries: [...library.entries, library.entries[0]] })
  )
  assert.throws(() => parseLibrary({ ...library, version: 99 }))
})
test('差异比较保留公共上下文，并显示新增、删除与空行', () => {
  assert.deepEqual(compareLines('same', 'same'), [])
  const diff = compareLines('head\nold\n\nend', 'head\nnew\n\nend')
  assert.ok(diff.some((line) => line.kind === 'removed' && line.text === 'old'))
  assert.ok(diff.some((line) => line.kind === 'added' && line.text === 'new'))
  assert.ok(diff.some((line) => line.kind === 'same' && line.text === 'end'))
})
test('旧草稿迁移后保留原件，队列并发保存最终为最后提交的数据', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'resume-library-test-'))
  try {
    const old = JSON.stringify(doc)
    await writeFile(join(directory, 'draft.json'), old)
    const storage = new LibraryStorage(directory)
    const migrated = await storage.load()
    assert.deepEqual(migrated.entries[0].document, doc)
    assert.equal(await readFile(join(directory, 'draft.json'), 'utf8'), old)
    const newer = structuredClone(migrated)
    newer.entries[0].document.title = '最后保存'
    await Promise.all([storage.save(migrated), storage.save(newer)])
    assert.equal((await storage.load()).entries[0].document.title, '最后保存')
    await assert.rejects(storage.save({ version: 99 }))
    await storage.save(migrated)
    assert.deepEqual(await storage.load(), migrated)
    await writeFile(join(directory, 'library.json'), '{corrupt')
    await assert.rejects(storage.load(), /读取失败/)
    assert.equal(await readFile(join(directory, 'library.json'), 'utf8'), '{corrupt')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
