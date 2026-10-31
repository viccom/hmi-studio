import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import { setOnUnauthorized } from './lib/api'
import { logout, bootstrapCookieSession } from './lib/auth'
import { initTheme } from './lib/theme'
import { registerSymbolComponents } from './symbols'
import { setPluginHost } from './symbols/plugin-loader'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
// element-plus 深色变量（html.dark 挂载生效；T16 工业深色默认）
import 'element-plus/theme-chalk/dark/css-vars.css'
import 'maotu/dist/style.css'
// 主题桥（最后加载保证覆盖优先级）：--el-* 色板对齐控制台 main.css——两前端视觉单点统一
import './styles/theme-bridge.css'

// 主题先于挂载应用（防首帧闪白）：读 webhmi_theme（默认 dark，与控制台共享）→ html.dark
initTheme()

// 401 全局兜底：任何 api() 调用未显式传回调时，token 失效即清态回登录页
setOnUnauthorized(() => { logout(); router.replace('/login') })

// 旧会话自愈：镜像 token 在而 cookie 缺失时静默换发（SSE 依赖 cookie）
bootstrapCookieSession()

// vue/custom-svg 型图元全局组件注册（批 B）：持 app 实例处——先于任何视图的
// registerSymbols()（registerConfig），maotu bs(tag) 拖入/渲染时可达（见 symbols/index.ts）
const app = createApp(App)
registerSymbolComponents(app)
// 插件宿主（P3b）：app.component 续注的持有者（loader 注册 vue 型插件组件用）
setPluginHost(app)
// pinia（P2 AI 面板）：agent store 依赖；面板本体 defineAsyncComponent 懒加载（AiDrawerHost）
app.use(router).use(ElementPlus).use(createPinia()).mount('#app')

