/**
 * T16 主题：工业深色默认。应用面 = `html.dark` class——element-plus
 * `theme-chalk/dark/css-vars.css`（html.dark 选择器）与 maotu dist/style.css
 * （`.dark .el-*` / `.dark .dark\:bg-*` **祖先选择器**，bundle 实读）共消费，
 * 故 MtEdit/MtPreview 无需各自接线即跟随；maotu 自带 toggle（useDark selector:'#mt-edit'，
 * 独立事实源）传 :use-theme-toggle="false" 隐藏防双源分叉。
 * 持久化 localStorage hmi_theme；useTheme() 模块级单例（App 壳持有，视图层复用）。
 */
import { ref } from 'vue'

export type Theme = 'dark' | 'light'

export const THEME_KEY = 'hmi_theme'

/** localStorage 原始串 → Theme；null/非法回落 dark（默认） */
export function readTheme(raw: string | null): Theme {
  return raw === 'light' ? 'light' : 'dark'
}

/** 应用到 DOM：html class 切换 */
export function applyTheme(t: Theme): void {
  document.documentElement.classList.toggle('dark', t === 'dark')
}

// 模块级单例：main.ts 启动时 initTheme()（mount 前应用防闪白）；视图层 useTheme()
// 复用同一状态——未初始化（如单测直调）时懒初始化一次。
const theme = ref<Theme>('dark')
let initialized = false

export function initTheme(): void {
  theme.value = readTheme(localStorage.getItem(THEME_KEY))
  applyTheme(theme.value)
  initialized = true
}

export function useTheme(): { theme: typeof theme; toggle: () => void } {
  if (!initialized) initTheme()
  const toggle = (): void => {
    theme.value = theme.value === 'dark' ? 'light' : 'dark'
    localStorage.setItem(THEME_KEY, theme.value)
    applyTheme(theme.value)
  }
  return { theme, toggle }
}
