import { useEffect, useRef, useState } from 'react'
import { DEFAULT_APPEARANCE, type Appearance } from '../../../shared/appearance'
import { useAppearance } from '../store/appearance'
import styles from './BackgroundSettings.module.scss'

export function BackgroundSettings({
  disabled,
  onError
}: {
  disabled: boolean
  onError: (message: string) => void
}): React.JSX.Element {
  const appearance = useAppearance((state) => state.appearance)
  const setAppearance = useAppearance((state) => state.setAppearance)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const revision = useRef(0)
  useEffect(() => {
    let active = true
    void window.resume
      .loadAppearance()
      .then((result) => {
        if (!active) return
        if (!result.ok) onError(result.error)
        else {
          setAppearance(result.data)
          setReady(true)
        }
      })
      .catch((error: Error) => {
        if (active) onError(error.message)
      })
    return () => {
      active = false
    }
  }, [setAppearance, onError])
  // 所有用户操作立即提交到主进程队列，关闭窗口时由主进程等待写入完成。
  async function persist(next: Appearance): Promise<void> {
    const current = ++revision.current
    setAppearance(next)
    setSaved('正在保存…')
    try {
      const result = await window.resume.saveAppearance(next)
      if (!result.ok) throw new Error(result.error)
      if (current === revision.current) setSaved('已保存')
    } catch (error) {
      if (current === revision.current) setSaved('保存失败')
      onError(error instanceof Error ? error.message : '背景保存失败')
    }
  }
  async function select(): Promise<void> {
    setBusy(true)
    try {
      // 选择新图前提交尚未落盘的遮罩值，避免旧计时器随后恢复上一张图片。
      if (timer.current) {
        clearTimeout(timer.current)
        timer.current = null
        await persist(useAppearance.getState().appearance)
      }
      const result = await window.resume.pickBackground()
      if (!result.ok) throw new Error(result.error)
      if (result.data)
        await persist({ ...useAppearance.getState().appearance, background: result.data })
    } catch (error) {
      onError(error instanceof Error ? error.message : '无法读取背景图片')
    } finally {
      setBusy(false)
    }
  }
  // 滑动暂停 250ms 后保存，避免每一像素都写入较大的图片数据。
  // 此处只保留最后一个短延迟任务，并在离开页面前补存最新设置。
  useEffect(() => {
    const flush = (): void => {
      if (timer.current) {
        clearTimeout(timer.current)
        timer.current = null
        void window.resume.saveAppearance(useAppearance.getState().appearance)
      }
    }
    window.addEventListener('beforeunload', flush)
    return () => {
      window.removeEventListener('beforeunload', flush)
      flush()
    }
  }, [])
  return (
    <details className={styles.settings}>
      <summary>工作区背景</summary>
      <div className={styles.content}>
        {appearance.background && <img src={appearance.background} alt="当前工作区背景" />}
        <button disabled={disabled || busy || !ready} onClick={() => void select()}>
          {busy ? '正在处理…' : appearance.background ? '更换背景图片' : '选择背景图片'}
        </button>
        {appearance.background && (
          <label>
            白色遮罩 <output>{Math.round(appearance.overlay * 100)}%</output>
            <input
              aria-label="背景遮罩"
              type="range"
              min="0"
              max="0.9"
              step="0.05"
              disabled={disabled || busy}
              value={appearance.overlay}
              onChange={(event) => {
                const next = { ...appearance, overlay: Number(event.target.value) }
                setAppearance(next)
                setSaved('等待保存…')
                if (timer.current) clearTimeout(timer.current)
                timer.current = setTimeout(() => {
                  timer.current = null
                  void persist(next)
                }, 250)
              }}
            />
          </label>
        )}
        <button
          disabled={disabled || busy}
          onClick={() => {
            if (timer.current) {
              clearTimeout(timer.current)
              timer.current = null
            }
            setReady(true)
            void persist({ ...DEFAULT_APPEARANCE })
          }}
        >
          恢复默认背景
        </button>
        <p>仅用于预览区，PDF 不包含背景。支持 PNG、JPEG，最大 12 MB。</p>
        {saved && <p role="status">{saved}</p>}
      </div>
    </details>
  )
}
