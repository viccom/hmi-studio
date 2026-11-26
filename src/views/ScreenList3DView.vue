<script setup lang="ts">
/**
 * 3D 场景列表页（/screens3d）——画面管理页的「3D 画面」分支（2026-11-26）。
 *
 * 与 2D 列表页（/）的关系：
 *   - 同一 rs-iot screen:* 键族，按 doc 的 $schema 分流（agent-hmi.scene3d/1 = 3D）
 *   - 共享顶栏/卡片墙/分组/新建卡的视觉（src/styles/screen-list.css，2D/3D 两页共用）
 *   - 独立数据流：只加载 3D 卡片；meta 改写走 scene3d-meta.ts（3D 的 name/group 在 meta 内，
 *     不能用 2D 的 unwrapDoc/wrapDoc 路径，会写坏文档结构）
 *
 * 缩略图：静态 SVG 海报，**不挂 WebGL**——列表页同时渲染多张卡，挂 WebGL 会耗尽上下文
 * （浏览器同源 WebGL context 上限约 8~16，2D 缩略图 MtPreview 已占位）。
 */
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { screensApi } from '../lib/screens'
import { loadScreenCardsByKind, groupSections, type ScreenCard } from '../lib/screen-list'
import { createScene3D, SLUG_PATTERN } from '../lib/screen-create'
import { updateScene3DMeta } from '../lib/scene3d-meta'
import ThemeToggle from '../components/ThemeToggle.vue'

const router = useRouter()
const sApi = screensApi()
const cards = ref<ScreenCard[]>([])
const loading = ref(false)

const sections = computed(() => groupSections(cards.value))
const groupCount = computed(() => sections.value.filter(g => g.name).length)

// 入场 stagger：全列表顺序编号，封顶防长列表迟滞
const appearDelay = (sIdx: number, i: number) =>
  Math.min((sIdx * 4 + i) * 45, 450)

async function refresh() {
  loading.value = true
  try {
    cards.value = await loadScreenCardsByKind('3d', sApi)
  } catch {
    ElMessage.error('3D 场景列表加载失败')
  } finally {
    loading.value = false
  }
}
onMounted(() => { void refresh() })

async function remove(id: string) {
  try {
    await sApi.del(id)
    await refresh()
  } catch {
    ElMessage.error('删除失败')
  }
}

// 新建/编辑信息共用对话框（与 2D 页同结构；name/group 落在 3D 文档 meta 内）
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

async function create() {
  const valid = await formRef.value?.validate().then(() => true).catch(() => false)
  if (!valid) return
  const { slug, name, group } = form.value
  const r = await createScene3D(sApi, slug, { name, group: group || undefined })
  if (r === 'exists') {
    ElMessage.error(`场景 ID "${slug}" 已存在（PUT 为全量覆盖，已阻止）`)
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
    await updateScene3DMeta(sApi, editId.value, {
      name: form.value.name,
      group: form.value.group, // '' = 移出组
    })
    dlgVisible.value = false
    await refresh()
  } catch {
    ElMessage.error('保存失败')
  }
}

// 浏览：新标签页打开运行页 /view3d/:id（运行页无返回管理页入口，避免占走当前标签页）
function openView(id: string) {
  const href = router.resolve({ path: `/view3d/${id}` }).href
  window.open(href, '_blank', 'noopener')
}
</script>

<template>
  <main class="list-page">
    <!-- 顶部导航：品牌 + 页面导航（2D/3D 分列）+ 统计/主题/新建 -->
    <header class="topbar">
      <div class="topbar-left">
        <span class="brand" @click="router.replace('/')">
          <span class="brand-mark" aria-hidden="true"></span>
          <span class="brand-name">RS-IOT</span>
          <span class="brand-app">HMI</span>
        </span>
        <span class="topbar-sep" aria-hidden="true"></span>
        <nav class="topnav" aria-label="站点导航">
          <router-link class="topnav-item" to="/">2D 画面</router-link>
          <span class="topnav-item active">3D 画面</span>
          <a class="topnav-item back-console" href="/">控制台 ↗</a>
        </nav>
      </div>
      <div class="topbar-right">
        <span class="topbar-stats" aria-label="3D 场景统计">
          <strong>{{ cards.length }}</strong> 个场景<template v-if="groupCount"> · {{ groupCount }} 组</template>
        </span>
        <ThemeToggle />
        <el-button type="primary" class="new-btn" @click="openCreate">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          新建 3D 场景
        </el-button>
      </div>
    </header>

    <div class="list-body">
      <!-- 空态 -->
      <div v-if="!loading && cards.length === 0" class="empty" data-testid="empty-state">
        <span class="empty-plus" aria-hidden="true">+</span>
        <p class="empty-title">还没有 3D 场景</p>
        <p class="empty-sub">创建第一个三维场景，摆放设备与管线，绑定 rs-iot 点位</p>
        <el-button type="primary" @click="openCreate">新建 3D 场景</el-button>
      </div>

      <div v-else v-loading="loading" class="sections">
        <section v-for="(g, sIdx) in sections" :key="g.name || '__ungrouped__'" class="group-block">
          <div class="group-head">
            <span class="group-no" aria-hidden="true">{{ String(sIdx + 1).padStart(2, '0') }}</span>
            <span class="group-name">{{ g.name || '未分组' }}</span>
            <span class="group-head-el"><el-tag size="small" type="info" round>{{ g.cards.length }}</el-tag></span>
            <span class="group-rule" aria-hidden="true"></span>
          </div>

          <div class="grid">
            <article
              v-for="(c, i) in g.cards"
              :key="c.id"
              class="screen-card card-in"
              :style="{ animationDelay: `${appearDelay(sIdx, i)}ms` }"
              :data-screen-id="c.id"
              @click="openView(c.id)"
            >
              <div class="card-thumb-box">
                <!-- 静态 SVG 海报：不挂 WebGL（列表页多卡并存会耗尽上下文） -->
                <div class="scene3d-thumb">
                  <svg viewBox="0 0 200 120" width="100%" height="100%" aria-hidden="true">
                    <path d="M20 95 L100 45 L180 95 Z" fill="#e8edf2" stroke="#8d99a6" stroke-width="1.5" />
                    <path d="M100 45 L100 95 M20 95 L180 95" stroke="#b9c2ca" stroke-width="1" />
                    <rect x="55" y="62" width="12" height="18" fill="#5b6570" />
                    <rect x="90" y="55" width="12" height="18" fill="#5b6570" />
                    <rect x="125" y="66" width="12" height="18" fill="#5b6570" />
                  </svg>
                  <span class="scene3d-thumb-tag">3D 场景</span>
                </div>
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
                    <button class="icon-btn" title="在新标签页打开运行页" @click="openView(c.id)">
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 3h7v7M21 3l-9 9M19 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h6" />
                      </svg>
                    </button>
                    <el-popconfirm :title="`删除场景 ${c.id}？`" confirm-button-text="删除" cancel-button-text="取消" @confirm="remove(c.id)">
                      <template #reference>
                        <button class="icon-btn danger" title="删除场景">
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

            <!-- 网格尾新建卡 -->
            <button type="button" class="new-card card-in" :style="{ animationDelay: `${appearDelay(sIdx, g.cards.length)}ms` }" @click="openCreate">
              <span class="new-card-plus" aria-hidden="true">+</span>
              <span>新建 3D 场景</span>
            </button>
          </div>
        </section>
      </div>
    </div>

    <el-dialog v-model="dlgVisible" :title="dlgMode === 'create' ? '新建 3D 场景' : '编辑场景信息'" width="420px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="72px">
        <el-form-item label="场景 ID" prop="slug">
          <el-input v-model="form.slug" placeholder="scene-id" autocomplete="off" :disabled="dlgMode === 'edit'" />
        </el-form-item>
        <el-form-item label="名称" prop="name">
          <el-input v-model="form.name" placeholder="场景名称" />
        </el-form-item>
        <el-form-item label="分组">
          <el-input v-model="form.group" placeholder="分组（可选）" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dlgVisible = false">取消</el-button>
        <el-button type="primary" @click="dlgMode === 'create' ? create() : saveMeta()">
          {{ dlgMode === 'create' ? '创建' : '保存' }}
        </el-button>
      </template>
    </el-dialog>
  </main>
</template>

<style scoped>
/* 共享样式（顶栏/卡片墙/分组/新建卡）见 src/styles/screen-list.css —— 2D/3D 两页共用。
   本页特有：3D 场景缩略图海报（静态 SVG，不挂 WebGL）。 */
.scene3d-thumb { width: 100%; height: 100%; position: relative; background: #eef1f4; display: flex; align-items: center; }
.scene3d-thumb-tag { position: absolute; left: 8px; top: 8px; font-size: 10px; padding: 2px 6px; border-radius: 3px; background: #1f4e79; color: #fff; }
</style>
