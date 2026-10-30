<script setup lang="ts">
// P0 版本面板（v1 极简）：列表（seq/ts/author/size）+ 预览单版 + 一键回滚。
// author=hmi-mcp 标 AI 徽标（多作者并存可运维——人/AI 一眼可辨）。
// 数据全部走 lib/screens.ts 版本三端点；回滚成功后 emit 通知父组件重载画布。
import { ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ApiError } from '../lib/api'
import { screensApi, type ScreenVersionDoc, type ScreenVersionMeta } from '../lib/screens'

const props = defineProps<{ slug: string }>()
const emit = defineEmits<{ (e: 'rollback-done'): void }>()

const sApi = screensApi()
const versions = ref<ScreenVersionMeta[]>([])
const loading = ref(false)
const preview = ref<ScreenVersionDoc>()

/** 列表加载（**slug 代际守卫**）：抽屉打开时切画面会触发两次 load，响应乱序时
 *  旧画面的行绝不能写进新 slug 的面板——否则点回滚 = 用旧 seq 操作新画面。 */
async function load(): Promise<void> {
  const slug = props.slug
  loading.value = true
  try {
    const rows = await sApi.versions(slug)
    if (props.slug !== slug) return
    versions.value = rows
  } catch (e) {
    if (props.slug !== slug) return
    versions.value = []
    // 404 = 旧版 rs-iot 没有该路由（新前端配旧后端）——提示能力缺失而非"加载失败"
    if (e instanceof ApiError && e.status === 404) {
      ElMessage.warning('服务端未启用画面版本管理（旧版 rs-iot）')
    } else {
      ElMessage.error('版本列表加载失败')
    }
  } finally {
    if (props.slug === slug) loading.value = false
  }
}

watch(() => props.slug, () => { preview.value = undefined; void load() }, { immediate: true })

/** 预览单版（410 = 正文过期；404 = 无该版/旧后端） */
async function showPreview(v: ScreenVersionMeta): Promise<void> {
  const slug = props.slug
  try {
    const d = await sApi.versionDoc(slug, v.seq)
    if (props.slug !== slug) return
    preview.value = d
  } catch (e) {
    if (props.slug !== slug) return
    if (e instanceof ApiError && e.status === 410) {
      ElMessage.warning('该版本正文已过期（TTL 淘汰），仅剩元数据')
    } else {
      ElMessage.error('版本取回失败')
    }
  }
}

async function doRollback(v: ScreenVersionMeta): Promise<void> {
  const slug = props.slug // 确认框期间切画面也能正确放弃旧画面的操作
  try {
    await ElMessageBox.confirm(
      `回滚到版本 ${v.seq}（${new Date(v.ts * 1000).toLocaleString()}，作者 ${v.author}）？当前内容会先存为新版本，可再次回滚。`,
      '回滚确认',
      { confirmButtonText: '回滚', cancelButtonText: '取消', type: 'warning' },
    )
  } catch { return /* 用户取消 */ }
  if (props.slug !== slug) return
  try {
    await sApi.rollback(slug, v.seq)
    if (props.slug !== slug) return // 迟到成功不打扰新画面
    ElMessage.success('已回滚')
    emit('rollback-done')
    await load()
  } catch (e) {
    if (props.slug !== slug) return
    if (e instanceof ApiError && e.status === 410) {
      ElMessage.error('目标版本正文已过期，无法回滚')
    } else {
      ElMessage.error('回滚失败')
    }
  }
}

const fmtSize = (n: number): string => (n >= 1024 ? `${(n / 1024).toFixed(1)} KiB` : `${n} B`)
const fmtTs = (n: number): string => new Date(n * 1000).toLocaleString('zh-CN', { hour12: false })
</script>

<template>
  <div class="ver-panel" data-testid="version-panel">
    <div class="ver-head">
      <span>版本历史</span>
      <el-button size="small" text :loading="loading" @click="load">刷新</el-button>
    </div>
    <el-empty v-if="!loading && versions.length === 0" description="暂无历史版本（首次保存后，内容变更才会产生版本）" :image-size="48" />
    <ul v-else class="ver-list">
      <li v-for="v in versions" :key="v.seq" class="ver-item">
        <span class="ver-seq">#{{ v.seq }}</span>
        <span class="ver-meta">
          <span class="ver-ts">{{ fmtTs(v.ts) }}</span>
          <span class="ver-author">
            {{ v.author }}
            <el-tag v-if="v.author === 'hmi-mcp'" size="small" type="warning" effect="plain" class="ai-badge">AI</el-tag>
          </span>
          <span class="ver-size">{{ fmtSize(v.size) }}</span>
        </span>
        <span class="ver-actions">
          <el-tag v-if="v.expired" size="small" type="info">正文过期</el-tag>
          <template v-else>
            <el-button size="small" text :disabled="loading" @click="showPreview(v)">预览</el-button>
            <el-button size="small" text type="warning" :disabled="loading" @click="doRollback(v)">回滚</el-button>
          </template>
        </span>
      </li>
    </ul>
    <div v-if="preview" class="ver-preview" data-testid="version-preview">
      <div class="ver-preview-head">版本 #{{ preview.seq }} · {{ preview.doc?.name ?? '' }}</div>
      <pre class="ver-preview-body">{{ JSON.stringify(preview.doc, null, 2).slice(0, 4000) }}</pre>
    </div>
  </div>
</template>

<style scoped>
.ver-panel { display: flex; flex-direction: column; gap: 8px; height: 100%; overflow: hidden; }
.ver-head { display: flex; align-items: center; justify-content: space-between; font-weight: 600; }
.ver-list { margin: 0; padding: 0; list-style: none; overflow: auto; flex: 1; min-height: 0; }
.ver-item {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 4px; border-bottom: 1px solid var(--el-border-color-lighter); font-size: 12px;
}
.ver-seq { font-family: monospace; min-width: 40px; }
.ver-meta { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
.ver-ts { color: var(--el-text-color-secondary); }
.ver-author { display: inline-flex; align-items: center; gap: 4px; }
.ai-badge { transform: scale(0.85); }
.ver-size { color: var(--el-text-color-secondary); font-family: monospace; }
.ver-actions { display: inline-flex; align-items: center; gap: 2px; }
.ver-preview { border-top: 1px solid var(--el-border-color); padding-top: 8px; max-height: 40%; display: flex; flex-direction: column; }
.ver-preview-head { font-size: 12px; color: var(--el-text-color-secondary); margin-bottom: 4px; }
.ver-preview-body {
  margin: 0; overflow: auto; font-size: 11px; line-height: 1.5;
  background: var(--el-fill-color-light); border-radius: 4px; padding: 8px;
  white-space: pre-wrap; word-break: break-all;
}
</style>
