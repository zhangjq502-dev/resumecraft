/** 外观设置属于应用，不进入简历内容、版本历史或导出文件。 */
export interface Appearance {
  version: 1
  background: string | null
  overlay: number
}
export const DEFAULT_APPEARANCE: Appearance = { version: 1, background: null, overlay: 0.35 }
export function parseAppearance(input: unknown): Appearance {
  if (!input || typeof input !== 'object') throw new Error('无效的背景设置')
  const value = input as Appearance
  if (
    value.version !== 1 ||
    typeof value.overlay !== 'number' ||
    !Number.isFinite(value.overlay) ||
    value.overlay < 0 ||
    value.overlay > 0.9
  )
    throw new Error('无效的遮罩设置')
  if (
    value.background !== null &&
    (typeof value.background !== 'string' ||
      value.background.length > 2_000_000 ||
      !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value.background))
  )
    throw new Error('背景图片格式无效或过大')
  return { version: 1, background: value.background, overlay: value.overlay }
}
