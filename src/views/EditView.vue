<script setup lang="ts">
// T4 编辑页：MtEdit 挂载 + 在线设备树（F5）+ 画面存取 round-trip（G-M1 主战场）。
// W7 用户反馈轮顶部条功能化：画面切换器（列表+新建）/ 预览新窗 / 用户+登出 / 返回列表。
// 装配契约（d.ts 实证）：MtEdit expose setImportJson(done)；onSaveClick payload=IExportJson；
// onReturnClick / onPreviewClick 无消费参数。doc 真相在 rs-iot（wrapDoc/unwrapDoc 同体契约，
// 见 lib/screens.ts）。
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox, ElNotification } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { MtEdit } from 'maotu'
import type { IExportJson, IDoneJson } from 'maotu'
import { screensApi, unwrapDoc, wrapDoc } from '../lib/screens'
import { ApiError } from '../lib/api'
import { sanitizeBiProps } from '../lib/bi-sanitize'
import { loadScreenCards, groupSections, type ScreenCard } from '../lib/screen-list'
import { createScreen, SLUG_PATTERN } from '../lib/screen-create'
import { fetchDeviceTree, type IDeviceInfo } from '../lib/device-tree'
import { getAuthedUser, logout } from '../lib/auth'
import { installBridge } from '../lib/bridge'
import { registerSymbols, setNavTargetOptions, upgradeNavTargets, flattenNavSections } from '../symbols'
import { buildSymbolDoc, registerMySymbols } from '../symbols/my-symbols'
import { loadPlugins } from '../symbols/plugin-loader'
import { applyFallback, restoreStashed } from '../symbols/plugin-fallback'
import { symbolsApi } from '../lib/symbols-api'
import { uid } from '../lib/uid'
import ThemeToggle from '../components/ThemeToggle.vue'
import BindPanel from '../components/BindPanel.vue'
import VersionPanel from '../components/VersionPanel.vue'

const route = useRoute()
const router = useRouter()
const sApi = screensApi()

// slug 跟随路由（W7 切换器经 route watch 重载，见下方 watch）
const slug = ref(route.params.id as string)
const editRef = ref<InstanceType<typeof MtEdit>>()
const deviceInfo = ref<IDeviceInfo[]>([])
const meta = ref<{ name?: string; group?: string }>({})
const user = getAuthedUser()
/** 当前画面版本号（P0 乐观锁）：加载时从 GET 取，保存时作 if_version 回传，成功后随响应更新。
 *  遗留画面（版本机制上线前）= 0——GET→PUT 原样回传即为正解，无需特判。 */
const version = ref(0)
/** 版本面板抽屉（P0 v1 极简：列表/预览/回滚） */
const verDrawer = ref(false)

// D6 编辑态守卫：编辑页同注入 $rsiot，send 确认框按钮为「取消/真实下发」
const bridge = installBridge({ mode: 'edit', router })
onUnmounted(() => bridge.uninstall())

const loadFailed = ref(false)
/** 保存三态锁（P1）：加载成功才放开保存。loadFailed 只覆盖"加载失败"，
 *  "加载在飞"（首载 loadSwitcherScreens 期间 / 切换器换画面 GET 未返）同样必须拦——
 *  否则空白画布 + 陈旧 meta 下的保存 = 全量 PUT 覆盖目标画面（唯一数据丢失路径）。 */
const loaded = ref(false)
/** 降级存档（P3b plugin-fallback）：未知 tag 项被占位替换时的原项（id → 原项）——
 *  保存时还原（占位不入库，插件缺席不丢数据）。 */
let stashedItems = new Map<string, Record<string, unknown>>()

async function loadScreen(pluginsReady?: Promise<unknown>) {
  const reqSlug = slug.value
  try {
    const { doc, version: ver } = await sApi.get(reqSlug)
    if (slug.value !== reqSlug) return // 竞态守卫：GET 在飞时已切换画面，迟到响应不得写入新画布（否则保存即跨画面覆盖）
    const { done, meta: m } = unwrapDoc(doc)
    meta.value = m
    version.value = ver
    upgradeNavTargets(done) // 存量跳转按钮 input→select（拖入为注册项深拷贝，旧实例需就地升级）
    // 插件装载汇合点：降级判定（knownTags）须含已装载插件 tag——GET 期间装载大多已完成。
    // catch 兜底：插件装载失败 = 无插件（相关图元走降级占位），不得阻断画面加载
    if (pluginsReady) await pluginsReady.catch(() => { /* 降级路径见 applyFallback */ })
    // 插件缺席降级（P3b）：未知 tag → 占位框（原项存档，保存还原）；未知 props 键剔除
    const fb = applyFallback(done as unknown as Record<string, unknown>)
    stashedItems = fb.stashed
    if (fb.degraded.length) {
      console.warn('[edit] 图元降级', fb.degraded)
      ElMessage.warning(`本画面 ${fb.degraded.length} 处图元降级显示（插件缺席或版本不符），保存不丢失原数据`)
    }
    editRef.value?.setImportJson(fb.done as unknown as IExportJson)
    loaded.value = true
    loadFailed.value = false
  } catch {
    if (slug.value !== reqSlug) return
    loadFailed.value = true // 加载失败置锁：空画布+陈旧 meta 下保存=用空 doc 覆盖画面
    loaded.value = false
    ElMessage.error('画面加载失败——已禁止保存，请刷新重试')
  }
}

onMounted(async () => {
  registerSymbols()
  // 插件目录装载（P3b）——与画面加载解耦并行：loadScreen 内部在降级判定前
  // await pluginsReady（插件 tag 面；装载完才算「已知 tag」）。lint 拒载经
  // ElNotification 可见（不静默）；index 缺席 = 无插件面，内部自吞不阻塞。
  const pluginsReady = loadPlugins(undefined, {
    onNotify: (msg) => ElNotification.warning({ title: '图元插件', message: msg, duration: 6000 }),
  })
  await loadSwitcherScreens() // 先于 loadScreen：nav-button options 注入后，存量实例升级才带得上列表
  await loadScreen(pluginsReady)
  // 在线设备树（失败静默为空——离线仍可组态，绑定列表面板为空）；与主加载无依赖，并行不串行
  void fetchDeviceTree().then((t) => { deviceInfo.value = t })
  // 「我的符号」注册（P3a）：失败静默为无符号（rs-iot 缺 symbol 端点时不阻塞编辑）
  void refreshMySymbols()
})

/** list + get 全量符号 → registerConfig「我的符号」组（同名覆盖语义刷新；version 参与去重签名）。 */
async function refreshMySymbols(): Promise<void> {
  try {
    const sApi = symbolsApi()
    const docs = await Promise.all((await sApi.list()).map(async (id) => {
      const g = await sApi.get(id)
      return { id, doc: g.doc, version: g.version }
    }))
    registerMySymbols(docs)
  } catch { /* 无符号服务面不阻塞编辑器 */ }
}

/** BindPanel「存为符号」（P3a）：槽位项是画布内存形态 group——克隆即合法 combin_json。
 *  同名符号覆盖（list 找 name 命中 → 复用 id + if_version），新名生成 sym-<uid>。 */
async function onSaveSymbol(item: IDoneJson): Promise<void> {
  let name: string
  try {
    const r = await ElMessageBox.prompt('符号显示名（左面板「我的符号」组；拖入画布即展开这组图元）', '存为符号', {
      inputValue: typeof item.title === 'string' ? item.title : '',
      inputValidator: (v: string) => (v.trim() ? true : '必填'),
    })
    name = r.value.trim()
  } catch { return /* 用户取消 */ }
  try {
    const sApi = symbolsApi()
    const raw = buildSymbolDoc(item, name)
    // BI 运行态复位（与画面保存同款）：组合里可能有 BI 图元，props.data 是宿主聚合的
    // 运行态快照——入库既撑大 128KiB 配额，拖入时还会带出陈旧数据（2026-10-31 审查补齐）。
    // symbols 层不得依赖 lib（check-layers），故 sanitize 放在本层做。
    const clean = sanitizeBiProps({ json: [raw.combin_json] }) as { json: Array<Record<string, unknown>> }
    const doc = { ...raw, combin_json: clean.json[0] ?? raw.combin_json }
    let id = ''
    let ifVersion: number | undefined
    for (const sid of await sApi.list()) {
      const g = await sApi.get(sid)
      if (g.doc.name === name) { id = sid; ifVersion = g.version; break }
    }
    if (!id) id = `sym-${uid()}`
    await sApi.put(id, doc, ifVersion)
    await refreshMySymbols()
    ElMessage.success(`已存为符号「${name}」——左面板「我的符号」组可拖用`)
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '存为符号失败')
  }
}

// W7 画面切换：/edit/a → /edit/b 组件被 vue-router 复用，onMounted 不再跑——
// watch 重载数据 + MtEdit :key 强制重挂画布（清选中态/undo 栈）。比在 App.vue
// 给 router-view 全局加 :key 影响面小（只作用于编辑器本体）。
watch(() => route.params.id, async (id) => {
  if (!id || id === slug.value) return
  slug.value = id as string
  loaded.value = false // :key 重挂后画布为空白——保存锁回到"加载中"，直至新画面 GET 成功
  await nextTick() // 等 :key 重挂完成，setImportJson 落在新实例
  await loadScreen()
})

// —— W7 画面切换器 / W8 分组两层：loadScreenCards 卡片（含 group）→ groupSections 分区
// （与列表页同一分区器，排序语义单源）——
const screens = ref<ScreenCard[]>([])
const switchSections = computed(() => groupSections(screens.value))

async function loadSwitcherScreens() {
  try {
    screens.value = await loadScreenCards(sApi)
    // 目标画面下拉：分组树形视觉（组头 ▼ + 子项缩进）——分区排序与切换器/列表页同源（groupSections）
    setNavTargetOptions(flattenNavSections(
      groupSections(screens.value).map((sec) => ({
        group: sec.name || undefined,
        cards: sec.cards.map((c) => ({ value: c.id, label: c.name ?? c.id })),
      })),
    ))
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

// —— W7 新建画面：探测+创建核上抽 lib/screen-create.ts（W8 起 EditView/ScreenListView
// 两处对话框共用，分组字段一致）——
const dlgVisible = ref(false)
const formRef = ref<FormInstance>()
const form = ref({ slug: '', name: '', group: '' })
const rules: FormRules = {
  slug: [
    { required: true, message: '必填', trigger: 'blur' },
    { pattern: SLUG_PATTERN, message: '小写字母/数字开头，仅含小写字母、数字、中划线', trigger: 'blur' },
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
  const { slug: id, name, group } = form.value
  const r = await createScreen(sApi, id, { name, group: group || undefined })
  if (r === 'exists') {
    ElMessage.error(`画面 ID "${id}" 已存在（PUT 为全量覆盖，已阻止）`)
    return
  }
  if (r === 'failed') {
    ElMessage.error('创建失败')
    return
  }
  dlgVisible.value = false
  await router.replace(`/edit/${id}`) // 经 route watch 重载画布
  void loadSwitcherScreens()
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
  if (loadFailed.value) {
    ElMessage.error('画面未成功加载，已禁止保存（避免空画面覆盖）')
    return
  }
  if (!loaded.value) {
    ElMessage.error('画面加载中，已禁止保存（加载完成前保存会覆盖目标画面）')
    return
  }
  const reqSlug = slug.value // 竞态守卫基准：PUT 在飞时可能已切画面
  try {
    // 还原降级存档（P3B）：占位项换回原项（插件缺席不丢数据），再走 BI sanitize
    const restored = restoreStashed(payload as unknown as Record<string, unknown>, stashedItems)
    // BI 图元的 props.data 是**运行态聚合数据**（通道 B 由宿主写回）：maotu 保存时
    // 把 props 拍平（bundle ud），这坨 JSON 会被原样 PUT 进 rs-iot——既撑大文档
    // （≤128 KiB 上限），又让下次加载读到陈旧数据。落库前复位（纯函数，lib/bi-sanitize.ts）。
    const clean = sanitizeBiProps(restored) as IExportJson
    // if_version 乐观锁（P0）：防编辑器与 hmi-mcp AI 互相静默覆盖。
    const r = await sApi.put(
      reqSlug,
      wrapDoc(clean, { name: meta.value.name ?? reqSlug, group: meta.value.group }),
      version.value,
    )
    if (slug.value !== reqSlug) return // 迟到响应：已切画面，勿污染新画面的 version
    // 判重命中时也是当前版本号；旧版服务端（无 version 字段）保持原值，
    // 避免 undefined 让后续保存退化为无条件写（复审 L9）。
    if (typeof r.version === 'number') version.value = r.version
    ElMessage.success('已保存')
  } catch (e) {
    if (slug.value !== reqSlug) return // 旧画面的失败/冲突不打扰新画面
    if (e instanceof ApiError && e.status === 409) {
      // 版本冲突：他人/AI 已先写。三态保存锁语义不变——只加"重新加载"这一出路。
      try {
        await ElMessageBox.confirm(
          `画面已被他人或 AI 修改（当前版本 ${typeof (e.body as { current_version?: number })?.current_version === 'number' ? (e.body as { current_version: number }).current_version : '?'}）。` +
          '为避免覆盖对方的改动，请先加载最新内容，再重新应用你的修改。',
          '版本冲突',
          { confirmButtonText: '加载最新', cancelButtonText: '稍后', type: 'warning' },
        )
        await loadScreen()
      } catch { /* 用户选择稍后——保留画布现状（下次保存仍会 409） */ }
      return
    }
    ElMessage.error('保存失败')
  }
}

/** 版本面板回滚完成 → 重载画布（回滚即新 head，version 随 loadScreen 更新） */
async function onRollbackDone(): Promise<void> {
  await loadScreen()
  void loadSwitcherScreens()
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
        popper-class="switcher-popper"
        @change="onSwitch"
      >
        <el-option-group
          v-for="g in switchSections" :key="g.name || '__ungrouped__'"
          :label="g.name || '未分组'"
        >
          <el-option v-for="s in g.cards" :key="s.id" :label="s.name ?? s.id" :value="s.id" />
        </el-option-group>
        <el-option label="+ 新建画面" :value="CREATE_OPT" />
      </el-select>
      <span class="screen-name">{{ meta.name ?? slug }}</span>
      <span class="screen-slug">{{ slug }}</span>
      <el-tag v-if="meta.group" size="small" type="info">{{ meta.group }}</el-tag>
      <span class="topbar-right">
        <el-button size="small" text data-testid="version-btn" @click="verDrawer = true">版本</el-button>
        <span v-if="user" class="topbar-user">{{ user.user_id }}</span>
        <el-button size="small" text @click="doLogout">退出</el-button>
        <ThemeToggle />
      </span>
    </header>
    <!-- use-theme-toggle=false：隐藏 maotu 自带夜间按钮（其 useDark 只切 #mt-edit、
         与全局 html.dark 双源分叉）——编辑器配色经 .dark 祖先选择器随全局主题。
         :key=slug：切换画面时强制重挂（undo 栈/选中态随之重置，见 watch 注释）。
         #deviceBind（插槽名以 d.ts 为准，F15 教训）：绑定 tab 整面板替换为 BindPanel，
         item 为 store 响应式对象，直改驱动保存链路（见 BindPanel 头注释） -->
    <MtEdit
      ref="editRef"
      :key="slug"
      class="edit-body"
      :device-info="deviceInfo"
      :use-theme-toggle="false"
      @on-save-click="(payload: IExportJson) => save(payload)"
      @on-return-click="router.replace('/')"
      @on-preview-click="openPreview"
    >
      <template #deviceBind="{ item }">
        <BindPanel :item="item" @save-symbol="onSaveSymbol" />
      </template>
    </MtEdit>
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
    <!-- P0 版本面板（v1 极简）：列表/预览/回滚 + AI 徽标 -->
    <el-drawer v-model="verDrawer" title="版本历史" size="360px">
      <VersionPanel :slug="slug" @rollback-done="onRollbackDone" />
    </el-drawer>
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
.screen-name { font-weight: 600; }
.screen-slug { color: var(--el-text-color-secondary); font-size: 12px; font-family: monospace; }
.topbar-right { margin-left: auto; display: inline-flex; align-items: center; gap: 8px; }
.topbar-user { color: var(--el-text-color-secondary); font-size: 12px; }
.edit-body { flex: 1; min-height: 0; }
/* W8 切换器两层：下拉加宽容纳「组 → 画面」两级 */
.screen-switcher { width: 190px; }
/* maotu 底部版本横幅：外层是固定 40px 的 <footer class="el-footer">（实测 DOM，
   只藏内层 div 时 footer 空行仍占位）——整行隐藏，高度归还画布。
   :has 锚定 npm 外链特征，防止误伤未来可能的其它 el-footer */
.edit-body :deep(footer.el-footer:has(> div > a[href*='npmjs.com/package/maotu'])) { display: none; }
/* W12.1 反馈：logo 位换 rs-iot 文字标（用户已购 maotu 授权可改 logo）。
   原图（el-image.w-45px，header 内唯一锚点）与 "Mt-Edit" 文本隐藏，
   原容器 ::before 注入 rs-iot 文字标；折叠按钮（同容器功能件）保留。
   同时修「工具栏全部靠顶部」：header 45px 内内容 24px 顶格（实测）——
   flex 垂直居中，整行回正。 */
.edit-body :deep(.el-header .el-image.w-45px),
.edit-body :deep(.el-header .el-image.w-45px + .el-text) { display: none; }
.edit-body :deep(.el-header .w-200px) { width: auto; }
.edit-body :deep(.el-header .w-200px:nth-child(1) > div)::before {
  content: 'rs-iot';
  font-weight: 700;
  font-size: 17px;
  letter-spacing: 0.5px;
  color: var(--el-color-primary);
  font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
  padding-left: 20px;
}
.edit-body :deep(.el-header) { display: flex; align-items: center; }
.edit-body :deep(.el-header > div) { width: 100%; }
/* W12.2 反馈：官方原版 = 两层 space-between 把 13 个工具钮撒满整行（东一个西一个）。
   重排：左簇（品牌+折叠）与中簇（编辑工具）相邻收拢、统一小间距；右侧视图簇
   margin-left:auto 靠右——标准编辑器形制（左工具右动作） */
.edit-body :deep(.el-header > div) { justify-content: flex-start; gap: 12px; }
.edit-body :deep(.el-header > div > div:not(.w-200px)) { justify-content: flex-start; gap: 4px; flex: 0 1 auto; width: auto; }
.edit-body :deep(.el-header > div > .w-200px:nth-child(3)) { margin-left: auto; }
/* 品牌 rs-iot 与折叠按钮间距（width:auto 后 justify-between 无余量，两钮贴死） */
.edit-body :deep(.el-header .w-200px:nth-child(1)) { gap: 10px; }
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
<style>
/* W8 切换器下拉美化：组名小字灰色、画面名主体。popper 挂 body（teleport），
   scoped 够不着——popper-class 命名空间 + 非 scoped 块 */
.switcher-popper .el-select-group__title {
  color: var(--el-text-color-secondary);
  font-size: 11px;
  padding: 4px 0 2px 12px;
}
.switcher-popper .el-select-dropdown__item { padding-left: 24px; }
</style>
