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

export const router = createRouter({ history: createWebHistory(), routes })

router.beforeEach((to) => {
  const publicPath = to.path === '/login' || to.path.startsWith('/dev/')
  if (!publicPath && !tokenStore.get()) return '/login'
})
