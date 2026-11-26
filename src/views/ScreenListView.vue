<script setup lang="ts">
// 画面列表（W8 分组）：分区卡片墙（组头=编号+组名+数量徽章）+ 顶部导航
// （品牌 / 画面·控制台 / 统计 / 主题 / 新建）+ 新建（探测+创建核 screen-create
// 共用，PUT blankScreen）+ 删除（popconfirm）。
// 视觉：Industrial Refined（与控制台同宗）——等宽编号/统计、16:9 深色缩略框、
// 卡片 hover 抬升主色描边、网格尾虚线新建卡、入场 staggered。
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { screensApi } from '../lib/screens'
import { loadScreenCardsByKind, groupSections, type ScreenCard } from '../lib/screen-list'
import { createScreen, SLUG_PATTERN } from '../lib/screen-create'
import { updateScreenMeta, renameGroup, disbandGroup } from '../lib/screen-group'
import { registerSymbols } from '../symbols'
import ThemeToggle from '../components/ThemeToggle.vue'
import ScreenThumb from '../components/ScreenThumb.vue'

const router = useRouter()
const sApi = screensApi()
const cards = ref<ScreenCard[]>([])
const loading = ref(false)

const sections = computed(() => groupSections(cards.value))
const groupCount = computed(() => sections.value.filter(g => g.name).length)
// 已有组名清单：新建/编辑对话框下拉（可选可新建，allow-create）
const groupOptions = computed(() => sections.value.filter(g => g.name).map(g => g.name))

// 入场 stagger：全列表顺序编号，封顶防长列表迟滞
const appearDelay = (sIdx: number, i: number) =>
  Math.min((sIdx * 4 + i) * 45, 450)

async function refresh() {
  loading.value = true
  try {
    cards.value = await loadScreenCardsByKind('2d', sApi)
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

// 新建/编辑信息共用对话框：create = slug+name+group（PUT blankScreen，探测防覆盖）；
// edit = slug 只读，name/group 可改（GET→合并→PUT 元数据补丁）。group 清空 = 移出组。
const dlgVisible = ref(false)
const dlgMode = ref<'create' | 'edit'>('create')
const editId = ref('')
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
  dlgMode.value = 'create'
  form.value = { slug: '', name: '', group: '' }
  dlgVisible.value = true
}

function openEdit(c: ScreenCard) {
  dlgMode.value = 'edit'
  editId.value = c.id
  form.value = { slug: c.id, name: c.name ?? '', group: c.group ?? '' }
  dlgVisible.value = true
}

// 浏览模式新标签页打开：/view 无返回管理页入口，避免占走当前标签页。
function openView(id: string) {
  const href = router.resolve({ path: `/view/${id}` }).href
  window.open(href, '_blank', 'noopener')
}

async function create() {
  const valid = await formRef.value?.validate().then(() => true).catch(() => false)
  if (!valid) return
  const { slug, name, group } = form.value
  const r = await createScreen(sApi, slug, { name, group: group || undefined })
  if (r === 'exists') {
    ElMessage.error(`画面 ID "${slug}" 已存在（PUT 为全量覆盖，已阻止）`)
    return
  }
  if (r === 'failed') {
    ElMessage.error('创建失败')
    return
  }
  dlgVisible.value = false
  await refresh()
}

async function saveMeta() {
  const valid = await formRef.value?.validate().then(() => true).catch(() => false)
  if (!valid) return
  try {
    await updateScreenMeta(sApi, editId.value, {
      name: form.value.name,
      group: form.value.group, // '' = 移出组
    })
    dlgVisible.value = false
    await refresh()
  } catch {
    ElMessage.error('保存失败')
  }
}

const submitDlg = () => (dlgMode.value === 'create' ? create() : saveMeta())

// 组管理（组 = doc.group 字段投影，操作即批量改写）：重命名（同名目标 = 合并）、解散（画面归未分组不删除）
const groupOps = computed(() =>
  new Set(sections.value.filter(g => g.name).map(g => g.name)),
)

async function doRenameGroup(g: string) {
  const r = await ElMessageBox.prompt('输入新的分组名称（与已有组同名将合并）', `重命名分组「${g}」`, {
    inputValue: g,
    inputPattern: /\S+/,
    inputErrorMessage: '组名不能为空',
    confirmButtonText: '重命名',
    cancelButtonText: '取消',
  }).catch(() => null)
  const to = r?.value.trim()
  if (!to || to === g) return
  const res = await renameGroup(sApi, cards.value, g, to)
  ElMessage[res.fail ? 'warning' : 'success'](
    res.fail ? `已更新 ${res.ok} 幅，${res.fail} 幅失败` : `已更新 ${res.ok} 幅画面`,
  )
  await refresh()
}

async function doDisbandGroup(g: string) {
  const n = cards.value.filter(c => c.group === g).length
  try {
    await ElMessageBox.confirm(
      `组内 ${n} 幅画面将移至「未分组」，画面不会被删除。`,
      `解散分组「${g}」`,
      { confirmButtonText: '解散', cancelButtonText: '取消', type: 'warning' },
    )
  } catch { return }
  const res = await disbandGroup(sApi, cards.value, g)
  ElMessage[res.fail ? 'warning' : 'success'](
    res.fail ? `已移出 ${res.ok} 幅，${res.fail} 幅失败` : `已解散，${res.ok} 幅画面移至未分组`,
  )
  await refresh()
}
</script>

<template>
  <main class="list-page">
    <!-- 顶部导航：品牌 + 页面导航 + 统计/主题/新建 -->
    <header class="topbar">
      <div class="topbar-left">
        <span class="brand" @click="router.replace('/')">
          <span class="brand-mark" aria-hidden="true"></span>
          <span class="brand-name">RS-IOT</span>
          <span class="brand-app">HMI</span>
        </span>
        <span class="topbar-sep" aria-hidden="true"></span>
        <nav class="topnav" aria-label="站点导航">
          <span class="topnav-item active">2D 画面</span>
          <router-link class="topnav-item" to="/screens3d">3D 画面</router-link>
          <a class="topnav-item back-console" href="/">控制台 ↗</a>
        </nav>
      </div>
      <div class="topbar-right">
        <span class="topbar-stats" aria-label="画面统计">
          <strong>{{ cards.length }}</strong> 幅<template v-if="groupCount"> · {{ groupCount }} 组</template>
        </span>
        <ThemeToggle />
        <el-button type="primary" class="new-btn" @click="openCreate">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          新建画面
        </el-button>
      </div>
    </header>

    <div class="list-body">
      <!-- 空态：自绘引导（优于 el-empty 默认观感） -->
      <div v-if="!loading && cards.length === 0" class="empty" data-testid="empty-state">
        <span class="empty-plus" aria-hidden="true">+</span>
        <p class="empty-title">还没有画面</p>
        <p class="empty-sub">创建第一幅组态画面，绑定 rs-iot 设备点位开始监控</p>
        <el-button type="primary" @click="openCreate">新建画面</el-button>
      </div>

      <div v-else v-loading="loading" class="sections">
        <section v-for="(g, sIdx) in sections" :key="g.name || '__ungrouped__'" class="group-block">
          <div class="group-head">
            <span class="group-no" aria-hidden="true">{{ String(sIdx + 1).padStart(2, '0') }}</span>
            <span class="group-name">{{ g.name || '未分组' }}</span>
            <span class="group-head-el"><el-tag size="small" type="info" round>{{ g.cards.length }}</el-tag></span>
            <!-- 组管理（真组才有）：重命名 / 解散 -->
            <span v-if="g.name && groupOps.has(g.name)" class="group-ops" @click.stop>
              <button class="icon-btn" title="重命名分组" @click="doRenameGroup(g.name)">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                </svg>
              </button>
              <button class="icon-btn danger" title="解散分组（画面移至未分组）" @click="doDisbandGroup(g.name)">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6" />
                </svg>
              </button>
            </span>
            <span class="group-rule" aria-hidden="true"></span>
          </div>

          <div class="grid">
            <article
              v-for="(c, i) in g.cards"
              :key="c.id"
              class="screen-card card-in"
              :style="{ animationDelay: `${appearDelay(sIdx, i)}ms` }"
              :data-screen-id="c.id"
              @click="router.push(`/edit/${c.id}`)"
            >
              <div class="card-thumb-box">
                <ScreenThumb :done="c.done" />
              </div>
              <div class="card-meta">
                <div class="card-row">
                  <span class="card-no" aria-hidden="true">{{ String(i + 1).padStart(2, '0') }}</span>
                  <span class="card-name" :title="c.name ?? c.id">{{ c.name ?? c.id }}</span>
                  <span class="card-ops" @click.stop>
                    <button class="icon-btn" title="编辑信息（名称/分组）" @click="openEdit(c)">
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                      </svg>
                    </button>
                    <button class="icon-btn" title="在新标签页打开浏览器" @click="openView(c.id)">
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 3h7v7M21 3l-9 9M19 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h6" />
                      </svg>
                    </button>
                    <el-popconfirm :title="`删除画面 ${c.id}？`" confirm-button-text="删除" cancel-button-text="取消" @confirm="remove(c.id)">
                      <template #reference>
                        <button class="icon-btn danger" title="删除画面">
                          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6" />
                          </svg>
                        </button>
                      </template>
                    </el-popconfirm>
                  </span>
                </div>
                <div class="card-slug">{{ c.id }}</div>
              </div>
            </article>

            <!-- 网格尾新建卡：比右上角按钮更直觉的创建入口 -->
            <button type="button" class="new-card card-in" :style="{ animationDelay: `${appearDelay(sIdx, g.cards.length)}ms` }" @click="openCreate">
              <span class="new-card-plus" aria-hidden="true">+</span>
              <span>新建画面</span>
            </button>
          </div>
        </section>
      </div>
    </div>

    <el-dialog v-model="dlgVisible" :title="dlgMode === 'create' ? '新建画面' : `编辑画面信息 — ${editId}`" width="420px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="72px">
        <el-form-item label="画面 ID" prop="slug">
          <el-input v-model="form.slug" placeholder="screen-id" autocomplete="off" :disabled="dlgMode === 'edit'" />
        </el-form-item>
        <el-form-item label="名称" prop="name">
          <el-input v-model="form.name" placeholder="画面名称" />
        </el-form-item>
        <el-form-item label="分组">
          <!-- 可下拉选已有组 / 直接输入新组名（allow-create）；清空 = 未分组 -->
          <el-select
            v-model="form.group"
            class="group-select"
            placeholder="不选即归入未分组"
            clearable filterable allow-create default-first-option
          >
            <el-option v-for="g in groupOptions" :key="g" :label="g" :value="g" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dlgVisible = false">取消</el-button>
        <el-button type="primary" @click="submitDlg">{{ dlgMode === 'create' ? '创建' : '保存' }}</el-button>
      </template>
    </el-dialog>
  </main>
</template>

<style scoped>
/* 共享样式（顶栏/卡片墙/分组/新建卡）见 src/styles/screen-list.css —— 2D/3D 两页共用，
   避免两份 scoped 样式漂移。本页特有样式在下方。 */
:deep(.card-thumb-box .thumb) { border: none; border-radius: 0; margin-bottom: 0; background: transparent; }
</style>
