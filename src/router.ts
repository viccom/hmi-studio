import { createRouter, createWebHistory } from 'vue-router'
import { tokenStore } from './lib/api'

// /dev/* 是研究资产（spike/probe），不进导航不进守卫
const routes = [
  { path: '/login', component: () => import('./views/LoginView.vue') },
  { path: '/', component: () => import('./views/ScreenListView.vue') },
  { path: '/view/:id', component: () => import('./views/ViewView.vue') },
  { path: '/edit/:id', component: () => import('./views/EditView.vue') },
  { path: '/dev/spike', component: () => import('./dev/SpikeEdit.vue') },
  { path: '/dev/probe', component: () => import('./dev/Probe.vue') },
]

// BASE_URL 随部署形态：dev '/'；build '/hmi/'（gateway hmi_dist 前缀——T18 vite.config）
export const router = createRouter({ history: createWebHistory(import.meta.env.BASE_URL), routes })

router.beforeEach((to) => {
  const publicPath = to.path === '/login' || to.path.startsWith('/dev/')
  if (!publicPath && !tokenStore.get()) return '/login'
  // 已登录不再回登录页（登录成功 replace('/') 后守卫兜底）
  if (to.path === '/login' && tokenStore.get()) return '/'
})
