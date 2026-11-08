import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadTS } from './load-ts.mjs'
const { parseAppearance, DEFAULT_APPEARANCE } = loadTS('src/shared/appearance.ts')
const { AppearanceStorage } = loadTS('src/main/appearance-storage.ts')
test('背景设置拒绝外部地址、错误类型和越界遮罩', () => {
  for (const patch of [
    { background: 'https://example.com/bg.jpg' },
    { overlay: NaN },
    { overlay: 1.1 },
    { version: 2 }
  ])
    assert.throws(() => parseAppearance({ ...DEFAULT_APPEARANCE, ...patch }))
  assert.deepEqual(parseAppearance({ ...DEFAULT_APPEARANCE, extra: 'drop' }), DEFAULT_APPEARANCE)
})
test('背景与遮罩独立持久化，新存储实例可恢复，重置不会影响简历文件', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'resume-appearance-'))
  try {
    const storage = new AppearanceStorage(folder)
    assert.deepEqual(await storage.load(), DEFAULT_APPEARANCE)
    await writeFile(join(folder, 'library.json'), 'unchanged')
    const chosen = { version: 1, background: 'data:image/jpeg;base64,aGVsbG8=', overlay: 0.65 }
    await storage.save(chosen)
    assert.deepEqual(await new AppearanceStorage(folder).load(), chosen)
    await storage.save(DEFAULT_APPEARANCE)
    assert.equal((await storage.load()).background, null)
    assert.equal(await readFile(join(folder, 'library.json'), 'utf8'), 'unchanged')
    await writeFile(join(folder, 'appearance.json'), '{invalid')
    await assert.rejects(storage.load(), /读取失败/)
    await storage.save(DEFAULT_APPEARANCE)
    assert.deepEqual(await storage.load(), DEFAULT_APPEARANCE)
  } finally {
    await rm(folder, { recursive: true, force: true })
  }
})
