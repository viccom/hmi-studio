<script setup lang="ts">
// 登录页：失败不跳转、el-alert 透传 rs-iot 的 401 文案；视觉只做居中卡片（工业深色调 T16 统一）
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { login } from '../lib/auth'

const router = useRouter()
const userId = ref('')
const pass = ref('')
const loading = ref(false)
const error = ref('')

async function submit() {
  if (loading.value || !userId.value || !pass.value) return
  loading.value = true
  error.value = ''
  const res = await login(userId.value, pass.value)
  loading.value = false
  if (res.ok) router.replace('/')
  else error.value = res.message
}
</script>

<template>
  <main class="login-wrap">
    <el-card class="login-card" header="HMI 组态登录">
      <el-form @submit.prevent="submit">
        <el-form-item>
          <el-input v-model="userId" placeholder="用户名" autocomplete="username" />
        </el-form-item>
        <el-form-item>
          <el-input v-model="pass" type="password" placeholder="密码" autocomplete="current-password" />
        </el-form-item>
        <el-form-item v-if="error">
          <el-alert :title="error" type="error" show-icon :closable="false" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" native-type="submit" style="width:100%" :loading="loading">登录</el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </main>
</template>

<style scoped>
.login-wrap {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
}
.login-card {
  width: 360px;
}
</style>
