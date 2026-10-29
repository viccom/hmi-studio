<!--
  BI 告警统计面板（ah-bi-alarms，vue 型）。
  ┌─ 数据通道（通道 B 扩展）─────────────────────────────────────────
  │ 宿主收集器在 BI 采集拍里拉 GET /api/v1/alarms（fetchAlarms 注入）→
  │ 组装告警信封 JSON 串写进 props.data，本组件 watch → parseAlarmEnvelope
  │ → 渲染。图元不发请求、不轮询。
  └────────────────────────────────────────────────────────────────────
  口径：**活动告警快照**（后端无告警历史）——总数 + 分级条 + 来源 Top + 最新列表。
  total=0 是「此刻无告警」（正常态，绿色），不是空数据（坏 JSON 才是空态）。
-->
<script setup lang="ts">
import { computed } from 'vue'
import {
  alarmLevelColor,
  alarmLevelLabel,
  formatClock,
  parseAlarmEnvelope,
} from './bi-chart-kit'

const props = defineProps<{
  fill?: string     // 强调色（标题色条）
  title?: string    // 面板标题
  maxRows?: number  // 最新告警行数上限（信封 latest cap 8，面板可再截）
  data?: string     // 运行时数据通道（宿主写回的告警信封 JSON 串）
}>()

const env = computed(() => parseAlarmEnvelope(props.data))
const ready = computed(() => env.value !== null)
const total = computed(() => env.value?.total ?? 0)
/** total=0 且信封在 → 安宁态（绿）；信封不在 → 空态（无数据）。 */
const calm = computed(() => ready.value && total.value === 0)

const levels = computed(() => env.value?.levels ?? [])
const sources = computed(() => env.value?.sources ?? [])
const latest = computed(() => (env.value?.latest ?? []).slice(0, Math.max(0, Number(props.maxRows ?? 6))))

const levelBarMax = computed(() => Math.max(1, ...levels.value.map((l) => l.count)))
</script>

<template>
  <div class="ah-bal" :style="{ background: '#161b22', border: '1px solid #21262d' }">
    <div v-if="props.title" class="ah-bal-title">
      <i class="ah-bal-accent" :style="{ background: props.fill ?? '#f85149' }"></i>
      <span>{{ props.title }}</span>
    </div>

    <!-- 空态：信封不在（未喂数/坏 JSON）——不是「无告警」 -->
    <div v-if="!ready" class="ah-bal-hint">暂无告警数据</div>

    <template v-else>
      <!-- 总数 + 分级条 -->
      <div class="ah-bal-head">
        <span class="ah-bal-total" :style="{ color: calm ? '#3fb950' : '#f85149' }">{{ total }}</span>
        <span class="ah-bal-total-label">活动告警</span>
        <div class="ah-bal-levels">
          <div v-for="l in levels" :key="l.level" class="ah-bal-level">
            <span class="ah-bal-level-name">{{ alarmLevelLabel(l.level) }}</span>
            <div class="ah-bal-level-track">
              <div class="ah-bal-level-bar" :style="{ width: `${(l.count / levelBarMax) * 100}%`, background: alarmLevelColor(l.level) }"></div>
            </div>
            <span class="ah-bal-level-count">{{ l.count }}</span>
          </div>
        </div>
      </div>

      <!-- 来源 Top -->
      <div v-if="sources.length" class="ah-bal-sources">
        <span v-for="s in sources" :key="s.source" class="ah-bal-chip" :title="`${s.source} × ${s.count}`">
          {{ s.source }}<b>×{{ s.count }}</b>
        </span>
      </div>

      <!-- 最新告警列表 -->
      <div class="ah-bal-list">
        <div v-if="calm" class="ah-bal-calm">✓ 无活动告警</div>
        <div v-for="a in latest" :key="a.key" class="ah-bal-row">
          <i class="ah-bal-dot" :style="{ background: alarmLevelColor(a.level) }"></i>
          <span class="ah-bal-time">{{ formatClock(a.ts) }}</span>
          <span class="ah-bal-src" :title="a.source">{{ a.source || '—' }}</span>
          <span class="ah-bal-msg" :title="a.message">{{ a.message || alarmLevelLabel(a.level) }}</span>
          <b v-if="a.count > 1" class="ah-bal-count">×{{ a.count }}</b>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.ah-bal {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  border-radius: 4px;
  box-sizing: border-box;
  overflow: hidden;
  font-family: Consolas, Menlo, monospace;
}
.ah-bal-title {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px 0;
  font-size: 14px;
  color: #c9d1d9;
}
.ah-bal-accent {
  display: inline-block;
  width: 3px;
  height: 12px;
  border-radius: 2px;
  flex: none;
}
.ah-bal-hint {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  color: #8b949e;
}
.ah-bal-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px 2px;
}
.ah-bal-total {
  font-size: 34px;
  font-weight: 700;
  line-height: 1;
}
.ah-bal-total-label {
  font-size: 12px;
  color: #8b949e;
  margin-right: 4px;
}
.ah-bal-levels { flex: 1; display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.ah-bal-level { display: flex; align-items: center; gap: 5px; font-size: 12px; }
.ah-bal-level-name { width: 24px; color: #8b949e; flex: none; }
.ah-bal-level-track { flex: 1; height: 5px; background: #1c2128; border-radius: 3px; overflow: hidden; }
.ah-bal-level-bar { height: 100%; border-radius: 3px; }
.ah-bal-level-count { width: 18px; text-align: right; color: #c9d1d9; flex: none; }
.ah-bal-sources {
  display: flex; flex-wrap: wrap; gap: 4px;
  padding: 4px 10px;
}
.ah-bal-chip {
  font-size: 12px; color: #8b949e;
  background: #1c2128; border-radius: 3px;
  padding: 1px 6px;
  max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.ah-bal-chip b { color: #c9d1d9; font-weight: 600; margin-left: 3px; }
.ah-bal-list {
  flex: 1; min-height: 0; overflow: hidden;
  border-top: 1px solid #21262d;
  margin-top: 2px;
  padding: 3px 10px 6px;
}
.ah-bal-calm {
  display: flex; align-items: center; justify-content: center;
  height: 100%; font-size: 14px; color: #3fb950;
}
.ah-bal-row {
  display: flex; align-items: center; gap: 6px;
  padding: 2.5px 0; font-size: 13px; color: #c9d1d9;
}
.ah-bal-dot { width: 6px; height: 6px; border-radius: 50%; flex: none; }
.ah-bal-time { color: #8b949e; flex: none; }
.ah-bal-src {
  color: #8b949e; max-width: 96px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: none;
}
.ah-bal-msg {
  flex: 1; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.ah-bal-count { color: #f85149; font-weight: 600; flex: none; }
</style>
