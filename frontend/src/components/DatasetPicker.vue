<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import type { DatasetCatalogItem } from '../../shared/contracts'

const props = defineProps<{
  datasets: DatasetCatalogItem[]
  modelValue: string[]
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>()
const selectedDatasetName = ref<string | null>(null)
const datasetGroups = computed(() => {
  const groups = new Map<string, DatasetCatalogItem[]>()
  for (const dataset of props.datasets) {
    const bags = groups.get(dataset.datasetName) ?? []
    bags.push(dataset)
    groups.set(dataset.datasetName, bags)
  }
  return [...groups].map(([name, bags]) => ({ name, bags }))
})
const activeGroup = computed(() => datasetGroups.value
  .find((group) => group.name === selectedDatasetName.value) ?? null)
const activeAvailableIds = computed(() => activeGroup.value?.bags
  .filter((bag) => bag.sourceAvailable)
  .map((bag) => bag.id) ?? [])
const allActiveSelected = computed(() =>
  activeAvailableIds.value.length > 0 &&
  activeAvailableIds.value.every((id) => props.modelValue.includes(id)),
)

watch(
  datasetGroups,
  (groups) => {
    if (!groups.some((group) => group.name === selectedDatasetName.value)) {
      selectedDatasetName.value = groups[0]?.name ?? null
    }
  },
  { immediate: true },
)

function toggle(id: string, checked: boolean, current: string[]): void {
  emit('update:modelValue', checked ? [...current, id] : current.filter((item) => item !== id))
}

function toggleActiveBags(): void {
  const activeIds = new Set(activeAvailableIds.value)
  const otherSelections = props.modelValue.filter((id) => !activeIds.has(id))
  emit('update:modelValue', allActiveSelected.value
    ? otherSelections
    : [...otherSelections, ...activeAvailableIds.value])
}
</script>

<template>
  <section class="picker-card" aria-labelledby="dataset-title">
    <div class="section-heading">
      <span class="step-badge">1</span>
      <div>
        <h2 id="dataset-title">挑选数据集</h2>
        <p>先选择数据集，再勾选该数据集中的 bag</p>
      </div>
      <div class="heading-actions">
        <span class="selection-count">{{ modelValue.length }} 已选</span>
      </div>
    </div>

    <div v-if="datasets.length" class="hierarchy">
      <div class="level-label"><span>1</span> 数据集</div>
      <div class="dataset-menu" role="tablist" aria-label="选择数据集">
        <button
          v-for="group in datasetGroups"
          :key="group.name"
          type="button"
          role="tab"
          :aria-selected="selectedDatasetName === group.name"
          :class="{ active: selectedDatasetName === group.name }"
          @click="selectedDatasetName = group.name"
        >
          <strong>{{ group.name }}</strong>
          <small>
            {{ group.bags.length }} 个 bag
            <template v-if="group.bags.some((bag) => modelValue.includes(bag.id))">
              · {{ group.bags.filter((bag) => modelValue.includes(bag.id)).length }} 已选
            </template>
          </small>
        </button>
      </div>

      <div class="bag-heading">
        <div class="level-label"><span>2</span> Bag</div>
        <button type="button" @click="toggleActiveBags">
          {{ allActiveSelected ? '清空当前' : '全选当前' }}
        </button>
      </div>
      <div class="bag-list">
        <label
          v-for="dataset in activeGroup?.bags ?? []"
          :key="dataset.id"
          class="bag-option"
          :class="{ selected: modelValue.includes(dataset.id), unavailable: !dataset.sourceAvailable }"
        >
          <input
            type="checkbox"
            :checked="modelValue.includes(dataset.id)"
            :disabled="!dataset.sourceAvailable"
            @change="toggle(dataset.id, ($event.target as HTMLInputElement).checked, modelValue)"
          />
          <span class="checkmark" aria-hidden="true">✓</span>
          <span class="bag-icon" aria-hidden="true">⌁</span>
          <span class="bag-copy">
            <strong>{{ dataset.bagName }}</strong>
            <span class="sensor-list" aria-label="传感器清单">
              <span
                v-for="sensor in dataset.sensorNames ?? dataset.sensorTypes"
                :key="sensor"
              >{{ sensor }}</span>
            </span>
            <small>
              {{ dataset.sensorTypes.join(' + ') }}
              <template v-if="dataset.hasGroundTruth"> · GT</template>
              <template v-if="dataset.expectedMessages">
                · {{ dataset.expectedMessages.toLocaleString() }} 条消息
              </template>
            </small>
          </span>
          <span class="availability" :class="{ ready: dataset.sourceAvailable }">
            {{ dataset.sourceAvailable ? '已就绪' : '缺少文件' }}
          </span>
        </label>
      </div>
    </div>
    <p v-else class="empty">还没有发现数据集 manifest。</p>
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

.section-heading h2 {
  margin: 0 0 3px;
  font-size: 18px;
}

.section-heading p {
  margin: 0;
  color: var(--ink-muted);
  font-size: 13px;
}

.step-badge {
  display: grid;
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 12px;
  color: #526f80;
  background: var(--blue-soft);
  font-weight: 800;
}

.selection-count {
  padding: 6px 10px;
  border-radius: 999px;
  color: #5d7480;
  background: #eaf0f2;
  font-size: 12px;
  font-weight: 700;
}
.heading-actions { display: flex; align-items: center; gap: 7px; margin-left: auto; }
.hierarchy { display: grid; gap: 12px; }
.level-label { display: flex; align-items: center; gap: 7px; color: #68797f; font-size: 11px; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; }
.level-label span { display: grid; width: 19px; height: 19px; place-items: center; border-radius: 7px; color: #557789; background: #e2ecef; font-size: 10px; }
.dataset-menu { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; }
.dataset-menu button { display: grid; gap: 2px; padding: 11px 13px; border: 1px solid #dfe5e3; border-radius: 14px; color: var(--ink); background: #fbfcfa; cursor: pointer; text-align: left; }
.dataset-menu button:hover { border-color: #adc3cd; }
.dataset-menu button.active { border-color: #91afbd; background: #edf4f5; box-shadow: 0 6px 16px rgba(82, 111, 128, .08); }
.dataset-menu strong { font-size: 13px; }
.dataset-menu small { color: var(--ink-muted); font-size: 10px; }
.bag-heading { display: flex; align-items: center; justify-content: space-between; margin-top: 2px; }
.bag-heading > button { padding: 6px 9px; border: 0; border-radius: 9px; color: #5d7480; background: #e5edee; cursor: pointer; font-size: 11px; font-weight: 800; }
.bag-list { display: grid; gap: 8px; }
.bag-option {
  position: relative;
  display: flex;
  min-height: 76px;
  align-items: center;
  gap: 13px;
  padding: 12px 13px;
  border: 1.5px solid #dfe5e3;
  border-radius: 18px;
  background: #fbfcfa;
  cursor: pointer;
  transition: 160ms ease;
}

.bag-option:hover:not(.unavailable) {
  border-color: #adc3cd;
  transform: translateY(-1px);
}

.bag-option.selected {
  border-color: #91afbd;
  background: #f0f5f6;
  box-shadow: 0 8px 22px rgba(82, 111, 128, 0.1);
}

.bag-option.unavailable {
  opacity: 0.55;
  cursor: not-allowed;
}

input {
  position: absolute;
  opacity: 0;
}

.checkmark {
  display: grid;
  width: 22px;
  height: 22px;
  flex: 0 0 auto;
  place-items: center;
  border: 1.5px solid #bdc9c8;
  border-radius: 8px;
  color: transparent;
  background: white;
  font-size: 13px;
  transition: 160ms ease;
}

input:focus-visible + .checkmark {
  outline: 3px solid rgba(108, 143, 160, 0.28);
  outline-offset: 2px;
}

input:checked + .checkmark {
  border-color: #66899a;
  color: white;
  background: #66899a;
}

.bag-icon {
  display: grid;
  width: 43px;
  height: 43px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 15px;
  color: #6c9288;
  background: var(--mint-soft);
  font-size: 25px;
  font-weight: 700;
}

.bag-copy {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.bag-copy strong,
.bag-copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bag-copy strong { font-size: 14px; }
.bag-copy small { color: var(--ink-muted); font-size: 11px; }
.sensor-list { display: flex; flex-wrap: wrap; gap: 4px; margin: 3px 0; }
.sensor-list span { padding: 3px 6px; border-radius: 7px; color: #526f80; background: #e8eff1; font-size: 9px; font-weight: 700; line-height: 1.2; }

.availability {
  margin-left: auto;
  flex: 0 0 auto;
  color: #89959a;
  font-size: 11px;
  font-weight: 700;
}

.availability.ready { color: #72a091; }
.empty { color: var(--ink-muted); }

@media (max-width: 600px) {
  .picker-card { padding: 19px; }
  .section-heading p { display: none; }
  .availability { display: none; }
}
</style>
