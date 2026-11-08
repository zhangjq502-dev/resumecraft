import { readFile, writeFile, rename, mkdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import {
  createLibrary,
  parseLibrary,
  MAX_LIBRARY_BYTES,
  type ResumeLibrary
} from '../shared/library'
import { parseDocument } from '../shared/resume'

/** 主进程存储服务：所有写入共享队列；失败不阻断后续任务。 */
export class LibraryStorage {
  private pending: Promise<unknown> = Promise.resolve()
  constructor(private readonly directory: string) {}

  async load(): Promise<ResumeLibrary | null> {
    const libraryPath = join(this.directory, 'library.json')
    try {
      if ((await stat(libraryPath)).size > MAX_LIBRARY_BYTES) throw new Error('简历库文件过大')
      return parseLibrary(JSON.parse(await readFile(libraryPath, 'utf8')))
    } catch (error) {
      // 只有文件不存在才尝试迁移；损坏的 v2 库不能静默回退并覆盖。
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        throw new Error('简历库读取失败，原文件已保留，自动保存已暂停。', { cause: error })
    }
    try {
      const legacyPath = join(this.directory, 'draft.json')
      if ((await stat(legacyPath)).size > 2_000_000) throw new Error('旧草稿文件过大')
      const library = createLibrary(parseDocument(JSON.parse(await readFile(legacyPath, 'utf8'))))
      await this.save(library)
      // 旧 draft.json 保留，升级过程不会删除或修改用户原草稿。
      return library
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw new Error('旧草稿迁移失败，原文件已保留。', { cause: error })
    }
  }

  async save(input: unknown): Promise<null> {
    const content = JSON.stringify(parseLibrary(input), null, 2)
    if (Buffer.byteLength(content, 'utf8') > MAX_LIBRARY_BYTES)
      throw new Error('简历库超过 32 MB，请删除不需要的历史或简历后重试')
    const task = this.pending
      .catch(() => undefined)
      .then(async () => {
        await mkdir(this.directory, { recursive: true })
        const path = join(this.directory, 'library.json')
        await writeFile(path + '.tmp', content, 'utf8')
        await rename(path + '.tmp', path)
      })
    this.pending = task
    await task
    return null
  }

  async drain(): Promise<void> {
    await this.pending
  }
}
