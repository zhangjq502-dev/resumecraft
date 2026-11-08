import { readFile, writeFile, rename, mkdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { DEFAULT_APPEARANCE, parseAppearance, type Appearance } from '../shared/appearance'

export class AppearanceStorage {
  private pending: Promise<unknown> = Promise.resolve()
  constructor(private readonly directory: string) {}
  async load(): Promise<Appearance> {
    try {
      const path = join(this.directory, 'appearance.json')
      if ((await stat(path)).size > 2_100_000) throw new Error('外观设置文件过大')
      return parseAppearance(JSON.parse(await readFile(path, 'utf8')))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { ...DEFAULT_APPEARANCE }
      throw new Error('背景设置读取失败，可点击“恢复默认背景”重置；简历内容不受影响。', {
        cause: error
      })
    }
  }
  async save(value: unknown): Promise<null> {
    const content = JSON.stringify(parseAppearance(value))
    const task = this.pending
      .catch(() => undefined)
      .then(async () => {
        await mkdir(this.directory, { recursive: true })
        const path = join(this.directory, 'appearance.json')
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
