<script setup lang="ts">
// 画面列表（W8 分组）：分区卡片墙（组头=编号+组名+数量徽章）+ 顶部导航
// （品牌 / 画面·控制台 / 统计 / 主题 / 新建）+ 新建（探测+创建核 screen-create
// 共用，PUT blankScreen）+ 删除（popconfirm）。
// 视觉：Industrial Refined（与控制台同宗）——等宽编号/统计、16:9 深色缩略框、
// 卡片 hover 抬升主色描边、网格尾虚线新建卡、入场 staggered。
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { screensApi } from '../lib/screens'
import { loadScreenCards, groupSections, type ScreenCard } from '../lib/screen-list'
import { createScreen, SLUG_PATTERN } from '../lib/screen-create'
import { registerSymbols } from '../symbols'
import ThemeToggle from '../components/ThemeToggle.vue'
import ScreenThumb from '../components/ScreenThumb.vue'

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
          <span class="topnav-item active">画面</span>
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
                    <button class="icon-btn" title="在浏览器打开" @click="router.push(`/view/${c.id}`)">
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
/* ---------- 顶部导航 ---------- */
.topbar {
  position: sticky; top: 0; z-index: 20;
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  height: 56px; padding: 0 24px;
  background: color-mix(in srgb, var(--el-bg-color) 82%, transparent);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.topbar-left, .topbar-right { display: inline-flex; align-items: center; gap: 16px; min-width: 0; }
.brand {
  display: inline-flex; align-items: center; gap: 8px; cursor: pointer; user-select: none;
}
.brand-mark {
  width: 14px; height: 14px; border-radius: 3px;
  background: linear-gradient(135deg, var(--el-color-primary), color-mix(in srgb, var(--el-color-primary) 55%, #000));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--el-color-primary) 18%, transparent);
}
.brand-name { font-weight: 800; font-size: 14px; letter-spacing: 0.08em; }
.brand-app {
  font-family: ui-monospace, Consolas, monospace; font-size: 11px; font-weight: 600;
  color: var(--el-color-primary); border: 1px solid color-mix(in srgb, var(--el-color-primary) 45%, transparent);
  border-radius: 4px; padding: 1px 5px; letter-spacing: 0.1em;
}
.topbar-sep { width: 1px; height: 20px; background: var(--el-border-color); }
.topnav { display: inline-flex; align-items: center; gap: 4px; }
.topnav-item {
  position: relative; padding: 6px 12px; border-radius: 6px;
  font-size: 13px; color: var(--el-text-color-regular); text-decoration: none; cursor: pointer;
  transition: color 0.15s ease, background 0.15s ease;
}
.topnav-item:hover { color: var(--el-color-primary); background: var(--el-fill-color-light); }
.topnav-item.active {
  color: var(--el-color-primary); font-weight: 600;
}
.topnav-item.active::after {
  content: ""; position: absolute; left: 12px; right: 12px; bottom: -1px; height: 2px;
  background: var(--el-color-primary); border-radius: 2px 2px 0 0;
}
.topbar-stats {
  font-size: 12px; color: var(--el-text-color-secondary); white-space: nowrap;
}
.topbar-stats strong {
  font-family: ui-monospace, Consolas, monospace; font-size: 13px;
  color: var(--el-text-color-primary);
}
.new-btn { display: inline-flex; align-items: center; gap: 6px; }

/* ---------- 主体 ---------- */
.list-body { max-width: 1480px; margin: 0 auto; padding: 26px 32px 72px; }

/* 空态 */
.empty {
  margin-top: 8vh; padding: 64px 24px; text-align: center;
  border: 1.5px dashed var(--el-border-color); border-radius: 14px;
  background: var(--el-bg-color);
}
.empty-plus {
  display: inline-flex; align-items: center; justify-content: center;
  width: 52px; height: 52px; border-radius: 14px; margin-bottom: 14px;
  font-size: 30px; font-weight: 300; color: var(--el-color-primary);
  background: color-mix(in srgb, var(--el-color-primary) 10%, transparent);
}
.empty-title { margin: 0 0 6px; font-size: 16px; font-weight: 600; color: var(--el-text-color-primary); }
.empty-sub { margin: 0 0 20px; font-size: 13px; color: var(--el-text-color-secondary); }

/* 分组 section */
.group-block { margin-bottom: 34px; }
.group-head { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
.group-no {
  font-family: ui-monospace, Consolas, monospace; font-size: 11px; font-weight: 700;
  color: var(--el-color-primary);
  border: 1px solid color-mix(in srgb, var(--el-color-primary) 40%, transparent);
  background: color-mix(in srgb, var(--el-color-primary) 8%, transparent);
  border-radius: 5px; padding: 2px 6px; letter-spacing: 0.08em;
}
.group-name { font-weight: 700; font-size: 15px; color: var(--el-text-color-primary); }
.group-head-el { display: inline-flex; }
.group-rule { flex: 1; height: 1px; background: linear-gradient(90deg, var(--el-border-color-lighter), transparent); }

/* 卡片网格 */
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(330px, 1fr));
  gap: 18px;
}

.screen-card {
  border: 1px solid var(--el-border-color-lighter); border-radius: 10px;
  background: var(--el-bg-color); overflow: hidden; cursor: pointer;
  transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
}
.screen-card:hover {
  transform: translateY(-3px);
  border-color: color-mix(in srgb, var(--el-color-primary) 50%, var(--el-border-color));
  box-shadow: 0 10px 28px -12px color-mix(in srgb, var(--el-color-primary) 35%, rgba(0, 0, 0, 0.35));
}

/* 缩略框：统一 16:9 视窗，深底衬托组态画面（画面本身多为深色底） */
.card-thumb-box {
  aspect-ratio: 16 / 9; overflow: hidden;
  background: var(--el-fill-color-darker);
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.card-thumb-box :deep(.thumb) { border: none; border-radius: 0; margin-bottom: 0; background: transparent; }

.card-meta { padding: 11px 14px 13px; }
.card-row { display: flex; align-items: center; gap: 8px; min-width: 0; }
.card-no {
  font-family: ui-monospace, Consolas, monospace; font-size: 11px;
  color: var(--el-text-color-secondary); flex-shrink: 0;
}
.card-name {
  flex: 1; min-width: 0; font-weight: 600; font-size: 14px;
  color: var(--el-text-color-primary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.card-ops { display: inline-flex; gap: 2px; flex-shrink: 0; }
.card-slug {
  margin-top: 4px; padding-left: 21px;
  color: var(--el-text-color-secondary); font-size: 11px;
  font-family: ui-monospace, Consolas, monospace; letter-spacing: 0.02em;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.icon-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 26px; height: 26px; padding: 0; border: none; border-radius: 6px;
  background: transparent; color: var(--el-text-color-secondary); cursor: pointer;
  transition: color 0.15s ease, background 0.15s ease;
}
.icon-btn:hover { background: var(--el-fill-color); color: var(--el-color-primary); }
.icon-btn.danger:hover { color: var(--el-color-danger); }

/* 网格尾新建卡 */
.new-card {
  min-height: 180px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;
  border: 1.5px dashed var(--el-border-color); border-radius: 10px;
  background: transparent; cursor: pointer;
  font-size: 13px; color: var(--el-text-color-secondary);
  transition: border-color 0.18s ease, color 0.18s ease, background 0.18s ease;
}
.new-card:hover {
  border-color: var(--el-color-primary); border-style: solid;
  color: var(--el-color-primary); background: color-mix(in srgb, var(--el-color-primary) 5%, transparent);
}
.new-card-plus { font-size: 26px; font-weight: 300; line-height: 1; }

/* 入场 staggered（prefers-reduced-motion 尊重系统设置） */
.card-in { animation: card-in 0.4s cubic-bezier(0.22, 0.8, 0.36, 1) both; }
@keyframes card-in {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: none; }
}
@media (prefers-reduced-motion: reduce) {
  .card-in { animation: none; }
  .screen-card, .new-card { transition: none; }
}
</style>
