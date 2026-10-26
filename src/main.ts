import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'
import { setOnUnauthorized } from './lib/api'
import { logout } from './lib/auth'
import { initTheme } from './lib/theme'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
// element-plus 深色变量（html.dark 挂载生效；T16 工业深色默认）
import 'element-plus/theme-chalk/dark/css-vars.css'
import 'maotu/dist/style.css'

// 主题先于挂载应用（防首帧闪白）：读 hmi_theme（默认 dark）→ html.dark
initTheme()

// 401 全局兜底：任何 api() 调用未显式传回调时，token 失效即清态回登录页
setOnUnauthorized(() => { logout(); router.replace('/login') })

createApp(App).use(router).use(ElementPlus).mount('#app')
