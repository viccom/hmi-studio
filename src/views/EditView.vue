<script setup lang="ts">
// T4 编辑页：MtEdit 挂载 + 在线设备树（F5）+ 画面存取 round-trip（G-M1 主战场）。
// W7 用户反馈轮顶部条功能化：画面切换器（列表+新建）/ 预览新窗 / 用户+登出 / 返回列表。
// 装配契约（d.ts 实证）：MtEdit expose setImportJson(done)；onSaveClick payload=IExportJson；
// onReturnClick / onPreviewClick 无消费参数。doc 真相在 rs-iot（wrapDoc/unwrapDoc 同体契约，
// 见 lib/screens.ts）。
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { MtEdit } from 'maotu'
import type { IExportJson } from 'maotu'
import { blankScreen, screensApi, unwrapDoc, wrapDoc } from '../lib/screens'
import { loadScreenCards } from '../lib/screen-list'
import { fetchDeviceTree, type IDeviceInfo } from '../lib/device-tree'
import { getAuthedUser, logout } from '../lib/auth'
import { installBridge } from '../lib/bridge'
import { registerSymbols } from '../symbols'
import ThemeToggle from '../components/ThemeToggle.vue'

const route = useRoute()
const router = useRouter()
const sApi = screensApi()

// slug 跟随路由（W7 切换器经 route watch 重载，见下方 watch）
const slug = ref(route.params.id as string)
const editRef = ref<InstanceType<typeof MtEdit>>()
const deviceInfo = ref<IDeviceInfo[]>([])
const meta = ref<{ name?: string; group?: string }>({})
const user = getAuthedUser()

// D6 编辑态守卫：编辑页同注入 $rsiot，send 确认框按钮为「取消/真实下发」
const bridge = installBridge({ mode: 'edit', router })
onUnmounted(() => bridge.uninstall())

async function loadScreen() {
  try {
    const { doc } = await sApi.get(slug.value)
    const { done, meta: m } = unwrapDoc(doc)
    meta.value = m
    editRef.value?.setImportJson(done)
  } catch {
    ElMessage.error('画面加载失败')
  }
}

onMounted(async () => {
  registerSymbols()
  await loadScreen()
  void loadSwitcherScreens()
  // 在线设备树（失败静默为空——编辑器离线仍可组态，绑定列表面板为空）
  deviceInfo.value = await fetchDeviceTree()
})

// W7 画面切换：/edit/a → /edit/b 组件被 vue-router 复用，onMounted 不再跑——
// watch 重载数据 + MtEdit :key 强制重挂画布（清选中态/undo 栈）。比在 App.vue
// 给 router-view 全局加 :key 影响面小（只作用于编辑器本体）。
watch(() => route.params.id, async (id) => {
  if (!id || id === slug.value) return
  slug.value = id as string
  await nextTick() // 等 :key 重挂完成，setImportJson 落在新实例
  await loadScreen()
})

// —— W7 画面切换器：复用列表页抽好的 loadScreenCards（ids → 并发取 doc 得 name）——
const screens = ref<{ id: string; name?: string }[]>([])

async function loadSwitcherScreens() {
  try {
    screens.value = (await loadScreenCards(sApi)).map(({ id, name }) => ({ id, name }))
  } catch {
    // 切换器非关键路径：加载失败静默为空（主加载 loadScreen 已报错）
  }
}

// 切换器末项伪选项（value 不可能撞 slug：slug 校验 ^[a-z0-9][a-z0-9-]*$）
const CREATE_OPT = '__create__'

async function onSwitch(id: string) {
  if (id === CREATE_OPT) {
    openCreate()
    return
  }
  if (id !== slug.value) await router.replace(`/edit/${id}`)
}

// —— W7 新建画面：列表页 create 逻辑内联于 ScreenListView 未抽库——本页最小同款
//（同校验/同 probe-then-PUT），报告注明；后续画面多时可上抽 lib ——
const dlgVisible = ref(false)
const formRef = ref<FormInstance>()
const form = ref({ slug: '', name: '' })
const rules: FormRules = {
  slug: [
    { required: true, message: '必填', trigger: 'blur' },
    { pattern: /^[a-z0-9][a-z0-9-]*$/, message: '小写字母/数字开头，仅含小写字母、数字、中划线', trigger: 'blur' },
  ],
  name: [{ required: true, message: '必填', trigger: 'blur' }],
}

function openCreate() {
  form.value = { slug: '', name: '' }
  dlgVisible.value = true
}

async function create() {
  const valid = await formRef.value?.validate().then(() => true).catch(() => false)
  if (!valid) return
  const { slug: id, name } = form.value
  try {
    await sApi.get(id)
    ElMessage.error(`画面 ID "${id}" 已存在（PUT 为全量覆盖，已阻止）`)
    return
  } catch { /* 404 = 可用 */ }
  try {
    await sApi.put(id, wrapDoc(blankScreen(id), { name }))
    dlgVisible.value = false
    await router.replace(`/edit/${id}`) // 经 route watch 重载画布
    void loadSwitcherScreens()
  } catch {
    ElMessage.error('创建失败')
  }
}

// W7 预览：router.resolve 产含 base 的 href（部署形态 /hmi/ 前缀正确，dev 为 /）
function openPreview() {
  window.open(router.resolve({ path: `/view/${slug.value}` }).href)
}

function doLogout() {
  logout()
  void router.replace('/login')
}

async function save(payload: IExportJson) {
  try {
    await sApi.put(slug.value, wrapDoc(payload, { name: meta.value.name ?? slug.value, group: meta.value.group }))
    ElMessage.success('已保存')
  } catch {
    ElMessage.error('保存失败')
  }
}
</script>

<template>
  <div class="edit-page">
    <header class="edit-topbar">
      <a class="back-list" title="返回画面列表" @click.prevent="router.replace('/')">‹ 画面列表</a>
      <el-select
        class="screen-switcher"
        size="small"
        :model-value="slug"
        title="切换画面"
        @change="onSwitch"
      >
        <el-option v-for="s in screens" :key="s.id" :label="s.name ?? s.id" :value="s.id" />
        <el-option label="+ 新建画面" :value="CREATE_OPT" />
      </el-select>
      <span class="screen-name">{{ meta.name ?? slug }}</span>
      <span class="screen-slug">{{ slug }}</span>
      <el-tag v-if="meta.group" size="small" type="info">{{ meta.group }}</el-tag>
      <span class="topbar-right">
        <span v-if="user" class="topbar-user">{{ user.user_id }}</span>
        <el-button size="small" text @click="doLogout">退出</el-button>
        <ThemeToggle />
      </span>
    </header>
    <!-- use-theme-toggle=false：隐藏 maotu 自带夜间按钮（其 useDark 只切 #mt-edit、
         与全局 html.dark 双源分叉）——编辑器配色经 .dark 祖先选择器随全局主题。
         :key=slug：切换画面时强制重挂（undo 栈/选中态随之重置，见 watch 注释） -->
    <MtEdit
      ref="editRef"
      :key="slug"
      class="edit-body"
      :device-info="deviceInfo"
      :use-theme-toggle="false"
      @on-save-click="(payload: IExportJson) => save(payload)"
      @on-return-click="router.replace('/')"
      @on-preview-click="openPreview"
    />
    <el-dialog v-model="dlgVisible" title="新建画面" width="420px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="72px">
        <el-form-item label="画面 ID" prop="slug">
          <el-input v-model="form.slug" placeholder="screen-id" autocomplete="off" />
        </el-form-item>
        <el-form-item label="名称" prop="name">
          <el-input v-model="form.name" placeholder="画面名称" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dlgVisible = false">取消</el-button>
        <el-button type="primary" @click="create">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.edit-page { height: 100vh; display: flex; flex-direction: column; }
.edit-topbar {
  display: flex; align-items: center; gap: 12px;
  height: 32px; padding: 0 16px; flex-shrink: 0;
  border-bottom: 1px solid var(--el-border-color-light);
}
.back-list {
  color: var(--el-text-color-secondary); font-size: 12px; cursor: pointer;
  white-space: nowrap;
}
.back-list:hover { color: var(--el-color-primary); }
.screen-switcher { width: 170px; }
.screen-name { font-weight: 600; }
.screen-slug { color: var(--el-text-color-secondary); font-size: 12px; font-family: monospace; }
.topbar-right { margin-left: auto; display: inline-flex; align-items: center; gap: 8px; }
.topbar-user { color: var(--el-text-color-secondary); font-size: 12px; }
.edit-body { flex: 1; min-height: 0; }
/* maotu 底部版本横幅：外层是固定 40px 的 <footer class="el-footer">（实测 DOM，
   只藏内层 div 时 footer 空行仍占位）——整行隐藏，高度归还画布。
   :has 锚定 npm 外链特征，防止误伤未来可能的其它 el-footer */
.edit-body :deep(footer.el-footer:has(> div > a[href*='npmjs.com/package/maotu'])) { display: none; }
/* W7 反馈3：右面板 tab 头常驻。滚动容器实测=el-aside 本体（.mt-edit-aside 基线
   overflow:auto，内层 #mt-right-aside overflow:visible）。**maotu 内置 element-plus
   把 el-tabs 渲染成 [content, header]（bundle 实证 return [p, m]，header 在 DOM 底部
   ——这正是"要滚到底才能看到 tab 头"的根因），故先 flex+order:-1 视觉重排到顶部，
   再 sticky top 钉住**——单纯 sticky top 对底部自然位的 header 永不生效（实测）。
   背景取 --el-bg-color：深色 rgb(20,20,20) 与 maotu dark:bg-myDarkBgColor 同值。 */
.edit-body :deep(.mt-edit-aside .el-tabs) {
  display: flex;
  flex-direction: column;
}
.edit-body :deep(.mt-edit-aside .el-tabs__header) {
  order: -1;
  position: sticky;
  top: 0;
  z-index: 5;
  background: var(--el-bg-color);
}
</style>
