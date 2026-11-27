<script setup lang="ts">
/**
 * `/view3d/:id` 的运行页分派器。
 *
 * v1（`scene3d/1` 语义节点 `nodes/links`）与 v2（上游 `objects` 节点图）**并存不转换**
 * （方案 §4.1）——两版渲染路径完全不同（程序化几何 vs 上游 SceneManager），
 * 转换会丢信息。此处只做形态判别后挂对应组件，自身不含渲染逻辑。
 */
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { sceneStore } from '../store'
import Scene3DView from './Scene3DView.vue'
import Scene3DRunView from './Scene3DRunView.vue'

const route = useRoute()
const kind = ref<'v1' | 'v2' | null>(null)
const sceneId = computed(() => String(route.params.id ?? ''))

onMounted(async () => {
  try {
    const { doc } = await sceneStore().get(sceneId.value)
    // v2 = 有 objects 数组（编辑器产出）；否则按 v1 处理（含加载失败时回退到 v1 的内置 demo）
    kind.value = Array.isArray(doc.objects) && doc.objects.length >= 0 && doc.objects !== undefined
      ? 'v2'
      : 'v1'
  } catch {
    kind.value = 'v1' // 读取失败交给 v1 页面自行回退内置 demo（保持既有行为）
  }
})
</script>

<template>
  <Scene3DRunView v-if="kind === 'v2'" />
  <Scene3DView v-else-if="kind === 'v1'" />
</template>
