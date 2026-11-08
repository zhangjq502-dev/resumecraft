import { useResume } from '../store/resume'
import styles from './AccentColorSettings.module.scss'
const COLORS = [
  '#222222',
  '#334155',
  '#273e5c',
  '#2563eb',
  '#0e766e',
  '#52786b',
  '#7c5c40',
  '#91546c'
]
export function AccentColorSettings({ disabled }: { disabled: boolean }): React.JSX.Element {
  const color = useResume((state) => state.document.accentColor)
  const update = useResume((state) => state.update)
  return (
    <fieldset className={styles.colors} disabled={disabled}>
      <legend>简历主题色</legend>
      <div>
        {COLORS.map((value) => (
          <button
            key={value}
            aria-label={`主题色${value}`}
            aria-pressed={color === value}
            style={{ backgroundColor: value }}
            onClick={() => update({ accentColor: value })}
          />
        ))}
        <input
          type="color"
          aria-label="自定义主题色"
          value={color ?? '#222222'}
          onChange={(event) => update({ accentColor: event.target.value })}
        />
      </div>
      <button onClick={() => update({ accentColor: undefined })}>恢复模板颜色</button>
    </fieldset>
  )
}
