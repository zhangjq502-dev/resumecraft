import { create } from 'zustand'
import { DEFAULT_APPEARANCE, type Appearance } from '../../../shared/appearance'
// 独立于简历状态，切换简历不会改变工作区背景。
export const useAppearance = create<{
  appearance: Appearance
  setAppearance: (value: Appearance) => void
}>((set) => ({
  appearance: DEFAULT_APPEARANCE,
  setAppearance: (appearance) => set({ appearance })
}))
