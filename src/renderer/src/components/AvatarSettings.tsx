import { useState } from 'react'
import { useResume } from '../store/resume'
import styles from './AvatarSettings.module.scss'

export function AvatarSettings({
  disabled,
  onError
}: {
  disabled: boolean
  onError: (message: string) => void
}): React.JSX.Element {
  const avatar = useResume((state) => state.document.avatar)
  const update = useResume((state) => state.update)
  const [selecting, setSelecting] = useState(false)
  async function selectAvatar(): Promise<void> {
    setSelecting(true)
    try {
      const result = await window.resume.pickAvatar()
      if (!result.ok) throw new Error(result.error)
      // 取消选择不改变原头像；图片内嵌到当前文档，跟随快照和 JSON 备份保存。
      if (result.data)
        update({ avatar: { dataUrl: result.data, shape: avatar?.shape ?? 'square' } })
    } catch (error) {
      onError(error instanceof Error ? error.message : '头像读取失败')
    } finally {
      setSelecting(false)
    }
  }
  return (
    <fieldset disabled={disabled || selecting} className={styles.settings}>
      <legend>简历头像</legend>
      {avatar && (
        <img
          className={avatar.shape === 'circle' ? styles.circle : ''}
          src={avatar.dataUrl}
          alt="当前头像"
        />
      )}
      <div className={styles.actions}>
        <button onClick={() => void selectAvatar()}>
          {selecting ? '处理中…' : avatar ? '更换头像' : '选择头像'}
        </button>
        {avatar && <button onClick={() => update({ avatar: undefined })}>移除头像</button>}
      </div>
      {avatar && (
        <label>
          头像形状
          <select
            aria-label="头像形状"
            value={avatar.shape}
            onChange={(event) =>
              update({ avatar: { ...avatar, shape: event.target.value as 'square' | 'circle' } })
            }
          >
            <option value="square">证件照</option>
            <option value="circle">圆形</option>
          </select>
        </label>
      )}
      <p>PNG / JPEG，最大 5 MB。居中显示，自动缩小后保存在本地。</p>
    </fieldset>
  )
}
