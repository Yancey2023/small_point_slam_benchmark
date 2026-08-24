<script setup lang="ts">
import { useId } from 'vue'

withDefaults(defineProps<{
  text: string
  label?: string
  align?: 'start' | 'center' | 'end'
}>(), {
  label: '查看说明',
  align: 'center',
})

const tooltipId = `help-tip-${useId()}`
</script>

<template>
  <span class="help-tip" :class="`align-${align}`">
    <button
      type="button"
      :aria-label="label"
      :aria-describedby="tooltipId"
    >
      <span aria-hidden="true">?</span>
    </button>
    <span :id="tooltipId" class="tooltip" role="tooltip">{{ text }}</span>
  </span>
</template>

<style scoped>
.help-tip { position: relative; display: inline-flex; flex: none; vertical-align: middle; }
button {
  display: grid;
  width: 17px;
  height: 17px;
  padding: 0;
  place-items: center;
  border: 1px solid #bdc9c7;
  border-radius: 50%;
  color: #6d7e82;
  background: #f8faf9;
  cursor: help;
  font-size: 10px;
  font-weight: 900;
  line-height: 1;
}
button:hover { border-color: #829b9d; color: #405d63; background: #edf3f1; }
button:focus-visible {
  border-color: #829b9d;
  outline: 3px solid rgba(100, 132, 146, .24);
  outline-offset: 2px;
  color: #405d63;
  background: #edf3f1;
}
.tooltip {
  position: absolute;
  z-index: 30;
  bottom: calc(100% + 9px);
  left: 50%;
  width: max-content;
  max-width: min(300px, calc(100vw - 32px));
  padding: 9px 11px;
  border: 1px solid #d5dfdc;
  border-radius: 10px;
  color: #eef4f2;
  background: #40565c;
  box-shadow: 0 8px 24px rgba(46, 65, 70, .18);
  font-size: 10px;
  font-weight: 500;
  line-height: 1.55;
  letter-spacing: 0;
  opacity: 0;
  pointer-events: none;
  text-align: left;
  transform: translate(-50%, 4px);
  transition: opacity 120ms ease, transform 120ms ease;
  white-space: normal;
}
.align-start .tooltip { left: 0; transform: translate(0, 4px); }
.align-end .tooltip { right: 0; left: auto; transform: translate(0, 4px); }
.help-tip:hover .tooltip,
.help-tip:focus-within .tooltip { opacity: 1; transform: translate(-50%, 0); }
.help-tip.align-start:hover .tooltip,
.help-tip.align-start:focus-within .tooltip,
.help-tip.align-end:hover .tooltip,
.help-tip.align-end:focus-within .tooltip { transform: translate(0, 0); }
</style>
