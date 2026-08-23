<script setup lang="ts">
import type { RunMode, RunModeCatalogItem } from '../../shared/contracts'

defineProps<{
  modes: RunModeCatalogItem[]
  modelValue: RunMode
}>()

defineEmits<{ 'update:modelValue': [value: RunMode] }>()
</script>

<template>
  <fieldset class="mode-picker">
    <legend>运行模式</legend>
    <label v-for="mode in modes" :key="mode.id" :class="{ selected: modelValue === mode.id }">
      <input
        type="radio"
        name="run-mode"
        :value="mode.id"
        :checked="modelValue === mode.id"
        @change="$emit('update:modelValue', mode.id)"
      />
      <span class="radio-mark" aria-hidden="true" />
      <span>
        <strong>{{ mode.name }}</strong>
        <small>{{ mode.description }}</small>
      </span>
    </label>
  </fieldset>
</template>

<style scoped>
.mode-picker { display: flex; min-width: 0; gap: 7px; margin: 0; padding: 0; border: 0; }
legend { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
label { display: grid; grid-template-columns: 15px minmax(0, 1fr); align-items: center; gap: 7px; max-width: 180px; padding: 8px 10px; border: 1px solid #d8e0de; border-radius: 12px; color: #68777c; background: #fff; cursor: pointer; }
label.selected { border-color: #9db2b5; color: #445d66; background: #edf3f1; }
input { position: absolute; opacity: 0; }
.radio-mark { width: 12px; height: 12px; border: 1.5px solid #aebdbd; border-radius: 50%; }
.selected .radio-mark { border: 4px solid #66828d; box-sizing: border-box; }
label > span:last-child { display: grid; min-width: 0; gap: 1px; }
strong { font-size: 11px; }
small { overflow: hidden; font-size: 8px; line-height: 1.35; text-overflow: ellipsis; white-space: nowrap; }
@media (max-width: 650px) {
  .mode-picker { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
  label { max-width: none; }
}
</style>
