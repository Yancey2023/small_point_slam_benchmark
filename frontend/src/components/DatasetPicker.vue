<script setup lang="ts">
import type { DatasetCatalogItem } from '../../shared/contracts'

defineProps<{
  datasets: DatasetCatalogItem[]
  modelValue: string[]
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>()

function toggle(id: string, checked: boolean, current: string[]): void {
  emit('update:modelValue', checked ? [...current, id] : current.filter((item) => item !== id))
}
</script>

<template>
  <section class="picker-card" aria-labelledby="dataset-title">
    <div class="section-heading">
      <span class="step-badge">1</span>
      <div>
        <h2 id="dataset-title">挑选数据集</h2>
        <p>可以一次安排多组数据，任务会依次运行</p>
      </div>
      <span class="selection-count">{{ modelValue.length }} 已选</span>
    </div>

    <div v-if="datasets.length" class="dataset-list">
      <label
        v-for="dataset in datasets"
        :key="dataset.id"
        class="dataset-option"
        :class="{ selected: modelValue.includes(dataset.id), unavailable: !dataset.sourceAvailable }"
      >
        <input
          type="checkbox"
          :checked="modelValue.includes(dataset.id)"
          :disabled="!dataset.sourceAvailable"
          @change="toggle(dataset.id, ($event.target as HTMLInputElement).checked, modelValue)"
        />
        <span class="checkmark" aria-hidden="true">✓</span>
        <span class="dataset-icon" aria-hidden="true">⌁</span>
        <span class="dataset-copy">
          <strong>{{ dataset.datasetName }}</strong>
          <span>{{ dataset.bagName }}</span>
          <small>
            {{ dataset.sensorTypes.join(' + ') }}
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
  margin-left: auto;
  padding: 6px 10px;
  border-radius: 999px;
  color: #5d7480;
  background: #eaf0f2;
  font-size: 12px;
  font-weight: 700;
}

.dataset-list {
  display: grid;
  gap: 10px;
}

.dataset-option {
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

.dataset-option:hover:not(.unavailable) {
  border-color: #adc3cd;
  transform: translateY(-1px);
}

.dataset-option.selected {
  border-color: #91afbd;
  background: #f0f5f6;
  box-shadow: 0 8px 22px rgba(82, 111, 128, 0.1);
}

.dataset-option.unavailable {
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

.dataset-icon {
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

.dataset-copy {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.dataset-copy strong,
.dataset-copy span,
.dataset-copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dataset-copy strong { font-size: 14px; }
.dataset-copy span { color: var(--ink-soft); font-size: 13px; }
.dataset-copy small { color: var(--ink-muted); font-size: 11px; }

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
