import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'
import { setOnUnauthorized } from './lib/api'
import { logout } from './lib/auth'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import 'maotu/dist/style.css'

// 401 全局兜底：任何 api() 调用未显式传回调时，token 失效即清态回登录页
setOnUnauthorized(() => { logout(); router.replace('/login') })

createApp(App).use(router).use(ElementPlus).mount('#app')
