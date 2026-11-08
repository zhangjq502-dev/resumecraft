export type TextFormat = 'bold' | 'italic' | 'strike'

/** 仅修改选区；再次操作可取消标记，光标范围始终指向原文字。 */
export function formatSelection(
  value: string,
  start: number,
  end: number,
  format: TextFormat
): { text: string; start: number; end: number } {
  const marker = { bold: '**', italic: '*', strike: '~~' }[format]
  if (start === end) return { text: value, start, end }
  const leftStars = value.slice(0, start).match(/\*+$/)?.[0].length ?? 0
  const rightStars = value.slice(end).match(/^\*+/)?.[0].length ?? 0
  const canUnwrap = format !== 'italic' || (leftStars % 2 === 1 && rightStars % 2 === 1)
  const wrapped =
    canUnwrap &&
    value.slice(Math.max(0, start - marker.length), start) === marker &&
    value.slice(end, end + marker.length) === marker
  if (wrapped)
    return {
      text:
        value.slice(0, start - marker.length) +
        value.slice(start, end) +
        value.slice(end + marker.length),
      start: start - marker.length,
      end: end - marker.length
    }
  return {
    text: value.slice(0, start) + marker + value.slice(start, end) + marker + value.slice(end),
    start: start + marker.length,
    end: end + marker.length
  }
}
