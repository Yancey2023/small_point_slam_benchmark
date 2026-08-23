<script setup lang="ts">
import { computed } from 'vue'

import type { AlgorithmCatalogItem } from '../../shared/contracts'
import { algorithmColor, algorithmIcon } from '@/presentation'

const props = defineProps<{
  algorithms: AlgorithmCatalogItem[]
  modelValue: string[]
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>()
const availableIds = computed(() =>
  props.algorithms.filter((algorithm) => algorithm.available).map((algorithm) => algorithm.id),
)
const allSelected = computed(() =>
  availableIds.value.length > 0 && availableIds.value.every((id) => props.modelValue.includes(id)),
)

function toggleAll(): void {
  emit('update:modelValue', allSelected.value ? [] : availableIds.value)
}

function toggle(id: string, checked: boolean, current: string[]): void {
  emit('update:modelValue', checked ? [...current, id] : current.filter((item) => item !== id))
}
</script>

<template>
  <section class="picker-card" aria-labelledby="algorithm-title">
    <div class="section-heading">
      <span class="step-badge">2</span>
      <div>
        <h2 id="algorithm-title">挑选算法</h2>
        <p>可以一次安排多个算法，任务会依次运行</p>
      </div>
      <div class="heading-actions">
        <button type="button" @click="toggleAll">{{ allSelected ? '清空' : '全选' }}</button>
        <span class="selection-count">{{ modelValue.length }} 已选</span>
      </div>
    </div>

    <div class="algorithm-grid">
      <label
        v-for="algorithm in algorithms"
        :key="algorithm.id"
        class="algorithm-option"
        :class="{ selected: modelValue.includes(algorithm.id), unavailable: !algorithm.available }"
        :style="{ '--algorithm-color': algorithmColor(algorithm.id) }"
      >
        <input
          type="checkbox"
          :checked="modelValue.includes(algorithm.id)"
          :disabled="!algorithm.available"
          @change="toggle(algorithm.id, ($event.target as HTMLInputElement).checked, modelValue)"
        />
        <span class="algorithm-icon">{{ algorithmIcon(algorithm.name) }}</span>
        <span class="algorithm-name">{{ algorithm.name }}</span>
        <span class="sensor-tags">{{ algorithm.sensorTypes.join(' · ') }}</span>
        <span class="state-dot" :title="algorithm.available ? '可执行文件已就绪' : '尚未构建'" />
      </label>
    </div>
  </section>
</template>

<style scoped>
.picker-card {
  padding: 24px;
  border: 1px solid var(--line-soft);
  border-radius: var(--radius-xl);
  background: rgba(255, 255, 255, 0.86);
  box-shadow: var(--shadow-card);
}

.section-heading {
  display: flex;
  align-items: center;
  gap: 13px;
  margin-bottom: 18px;
}

.section-heading h2 { margin: 0 0 3px; font-size: 18px; }
.section-heading p { margin: 0; color: var(--ink-muted); font-size: 13px; }

.step-badge {
  display: grid;
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 12px;
  color: #5e707c;
  background: var(--slate-soft);
  font-weight: 800;
}

.selection-count {
  padding: 6px 10px;
  border-radius: 999px;
  color: #60737e;
  background: #edf1f2;
  font-size: 12px;
  font-weight: 700;
}
.heading-actions { display: flex; align-items: center; gap: 7px; margin-left: auto; }
.heading-actions button { padding: 6px 9px; border: 0; border-radius: 9px; color: #60737e; background: #e7edef; cursor: pointer; font-size: 11px; font-weight: 800; }

.algorithm-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.algorithm-option {
  --algorithm-color: #557d96;
  --algorithm-bg: #e2edf2;
  position: relative;
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) 8px;
  grid-template-rows: auto auto;
  align-items: center;
  gap: 2px 11px;
  min-height: 74px;
  padding: 11px 12px;
  border: 1.5px solid #dfe5e3;
  border-radius: 18px;
  background: #fbfcfa;
  cursor: pointer;
  transition: 160ms ease;
}

.algorithm-option:hover:not(.unavailable) { transform: translateY(-1px); }
.algorithm-option.selected {
  border-color: var(--algorithm-color);
  box-shadow: 0 8px 20px color-mix(in srgb, var(--algorithm-color) 18%, transparent);
}
.algorithm-option.unavailable { opacity: 0.48; cursor: not-allowed; }

input { position: absolute; opacity: 0; }
input:focus-visible ~ .algorithm-icon { outline: 3px solid rgba(100, 132, 146, 0.3); }

.algorithm-icon {
  display: grid;
  grid-row: 1 / 3;
  width: 42px;
  height: 42px;
  place-items: center;
  border-radius: 15px 12px 16px 11px;
  color: var(--algorithm-color);
  background: color-mix(in srgb, var(--algorithm-color) 16%, white);
  font-weight: 900;
}

.algorithm-name { align-self: end; font-size: 14px; font-weight: 800; }
.sensor-tags {
  align-self: start;
  overflow: hidden;
  color: var(--ink-muted);
  font-size: 10px;
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;
}
.state-dot {
  grid-column: 3;
  grid-row: 1 / 3;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #bfc8c7;
}
.algorithm-option:not(.unavailable) .state-dot {
  background: #87bea9;
  box-shadow: 0 0 0 4px #e7f6f0;
}

@media (max-width: 600px) {
  .picker-card { padding: 19px; }
  .section-heading p { display: none; }
  .algorithm-grid { grid-template-columns: 1fr; }
}
</style>
