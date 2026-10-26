<script setup lang="ts">
// 画面列表：卡片墙（缩略图/名称/slug/group tag）+ 新建（PUT blankScreen）+ 删除（popconfirm）
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { blankScreen, screensApi, wrapDoc } from '../lib/screens'
import { loadScreenCards, type ScreenCard } from '../lib/screen-list'
import { registerSymbols } from '../symbols'
import ThemeToggle from '../components/ThemeToggle.vue'
import ScreenThumb from '../components/ScreenThumb.vue'

const router = useRouter()
const sApi = screensApi()
const cards = ref<ScreenCard[]>([])
const loading = ref(false)

async function refresh() {
  loading.value = true
  try {
    cards.value = await loadScreenCards(sApi)
  } catch {
    ElMessage.error('画面列表加载失败')
  } finally {
    loading.value = false
  }
}
onMounted(() => {
  // 自绘图元注册（幂等）：缩略图 MtPreview 渲染同样查注册表（F18③）
  registerSymbols()
  void refresh()
})

async function remove(id: string) {
  try {
    await sApi.del(id)
    await refresh()
  } catch {
    ElMessage.error('删除失败')
  }
}

// 新建画面：slug 即 rs-iot 画面 id；PUT 是 upsert，先探测防误覆盖既有画面
const dlgVisible = ref(false)
const formRef = ref<FormInstance>()
const form = ref({ slug: '', name: '', group: '' })
const rules: FormRules = {
  slug: [
    { required: true, message: '必填', trigger: 'blur' },
    { pattern: /^[a-z0-9][a-z0-9-]*$/, message: '小写字母/数字开头，仅含小写字母、数字、中划线', trigger: 'blur' },
  ],
  name: [{ required: true, message: '必填', trigger: 'blur' }],
}

function openCreate() {
  form.value = { slug: '', name: '', group: '' }
  dlgVisible.value = true
}

async function create() {
  const valid = await formRef.value?.validate().then(() => true).catch(() => false)
  if (!valid) return
  const { slug, name, group } = form.value
  try {
    await sApi.get(slug)
    ElMessage.error(`画面 ID "${slug}" 已存在（PUT 为全量覆盖，已阻止）`)
    return
  } catch { /* 404 = 可用 */ }
  try {
    await sApi.put(slug, wrapDoc(blankScreen(slug), { name, group: group || undefined }))
    dlgVisible.value = false
    await refresh()
  } catch {
    ElMessage.error('创建失败')
  }
}
</script>

<template>
  <main class="list-page">
    <header class="list-head">
      <h2>画面列表</h2>
      <span class="head-right">
        <ThemeToggle />
        <el-button type="primary" @click="openCreate">新建画面</el-button>
      </span>
    </header>

    <el-empty v-if="!loading && cards.length === 0" description="暂无画面，点击右上角新建" />

    <el-row v-else v-loading="loading" :gutter="16">
      <el-col v-for="c in cards" :key="c.id" :xs="24" :sm="12" :md="8" :lg="6" class="card-col">
        <el-card class="screen-card" shadow="hover" @click="router.push(`/edit/${c.id}`)">
          <ScreenThumb :done="c.done" />
          <div class="card-head">
            <span class="card-name" :title="c.name ?? c.id">{{ c.name ?? c.id }}</span>
            <span class="card-ops" @click.stop>
              <button class="icon-btn" title="在浏览器打开" @click="router.push(`/view/${c.id}`)">
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M14 3h7v7M21 3l-9 9M19 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h6" />
                </svg>
              </button>
              <el-popconfirm :title="`删除画面 ${c.id}？`" confirm-button-text="删除" cancel-button-text="取消" @confirm="remove(c.id)">
                <template #reference>
                  <button class="icon-btn" title="删除画面">
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6" />
                    </svg>
                  </button>
                </template>
              </el-popconfirm>
            </span>
          </div>
          <div class="card-slug">{{ c.id }}</div>
          <el-tag v-if="c.group" size="small" type="info">{{ c.group }}</el-tag>
        </el-card>
      </el-col>
    </el-row>

    <el-dialog v-model="dlgVisible" title="新建画面" width="420px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="72px">
        <el-form-item label="画面 ID" prop="slug">
          <el-input v-model="form.slug" placeholder="screen-id" autocomplete="off" />
        </el-form-item>
        <el-form-item label="名称" prop="name">
          <el-input v-model="form.name" placeholder="画面名称" />
        </el-form-item>
        <el-form-item label="分组">
          <el-input v-model="form.group" placeholder="分组（可选）" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dlgVisible = false">取消</el-button>
        <el-button type="primary" @click="create">创建</el-button>
      </template>
    </el-dialog>
  </main>
</template>

<style scoped>
.list-page { padding: 24px; }
.list-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.head-right { display: inline-flex; align-items: center; gap: 12px; }
.list-head h2 { margin: 0; }
.card-col { margin-bottom: 16px; }
.screen-card { cursor: pointer; }
.card-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.card-name { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.card-ops { display: inline-flex; gap: 4px; flex-shrink: 0; }
.card-slug { color: var(--el-text-color-secondary); font-size: 12px; font-family: monospace; margin: 4px 0 8px; }
.icon-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 26px; height: 26px; padding: 0; border: none; border-radius: 4px;
  background: transparent; color: var(--el-text-color-secondary); cursor: pointer;
}
.icon-btn:hover { background: var(--el-fill-color-light); color: var(--el-color-primary); }
</style>
