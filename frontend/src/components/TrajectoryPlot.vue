<script setup lang="ts">
import { computed, ref } from 'vue'

import type { TrajectoryResponse } from '../../shared/contracts'

interface TrajectorySeries {
  id: string
  label: string
  color: string
  dash?: string
  trajectory: TrajectoryResponse
}

const props = defineProps<{ series: TrajectorySeries[] }>()

type Projection = 'xy' | 'xz' | 'yz'
const projection = ref<Projection>('xy')

const labels: Record<Projection, [string, string]> = {
  xy: ['X', 'Y'],
  xz: ['X', 'Z'],
  yz: ['Y', 'Z'],
}

const plot = computed(() => {
  const projected = props.series.map((item) => ({
    ...item,
    values: item.trajectory.points.map((point) => {
      if (projection.value === 'xz') return [point.x, point.z] as const
      if (projection.value === 'yz') return [point.y, point.z] as const
      return [point.x, point.y] as const
    }),
  }))
  const allValues = projected.flatMap((item) => item.values)
  const minA = allValues.length ? Math.min(...allValues.map((point) => point[0])) : 0
  const maxA = allValues.length ? Math.max(...allValues.map((point) => point[0])) : 1
  const minB = allValues.length ? Math.min(...allValues.map((point) => point[1])) : 0
  const maxB = allValues.length ? Math.max(...allValues.map((point) => point[1])) : 1
  const spanA = Math.max(maxA - minA, 0.001)
  const spanB = Math.max(maxB - minB, 0.001)
  const toScreen = ([a, b]: readonly number[]) => ({
    x: 42 + ((a! - minA) / spanA) * 716,
    y: 378 - ((b! - minB) / spanB) * 336,
  })
  return {
    series: projected.map((item) => {
      const points = item.values.map(toScreen)
      return {
        ...item,
        path: points
          .map(
            (point, index) =>
              `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`,
          )
          .join(' '),
        start: points[0] ?? { x: 0, y: 0 },
        end: points.at(-1) ?? { x: 0, y: 0 },
      }
    }),
    minA,
    maxA,
    minB,
    maxB,
  }
})

function meters(value: number): string {
  return `${value.toFixed(Math.abs(value) >= 100 ? 0 : 1)} m`
}
</script>

<template>
  <div class="trajectory-wrap">
    <div class="plot-toolbar">
      <div class="projection-tabs" aria-label="轨迹投影视图">
        <button
          v-for="view in (['xy', 'xz', 'yz'] as Projection[])"
          :key="view"
          type="button"
          :class="{ active: projection === view }"
          @click="projection = view"
        >
          {{ view.toUpperCase() }}
        </button>
      </div>
      <span>{{ series.length }} 条轨迹叠加</span>
    </div>

    <div class="canvas-shell">
      <svg viewBox="0 0 800 420" role="img" aria-label="多算法 SLAM 轨迹对比图">
        <g class="grid-lines">
          <line
            v-for="value in [80, 208, 336, 464, 592, 720]"
            :key="`v${value}`"
            :x1="value"
            y1="30"
            :x2="value"
            y2="390"
          />
          <line
            v-for="value in [70, 140, 210, 280, 350]"
            :key="`h${value}`"
            x1="28"
            :y1="value"
            x2="772"
            :y2="value"
          />
        </g>
        <g v-for="item in plot.series" :key="item.id">
          <path class="route-underlay" :d="item.path" />
          <path
            class="route"
            :d="item.path"
            :style="{ stroke: item.color, strokeDasharray: item.dash }"
          />
          <circle
            class="start-marker"
            :cx="item.start.x"
            :cy="item.start.y"
            r="5"
            :style="{ stroke: item.color }"
          />
          <circle
            class="end-marker"
            :cx="item.end.x"
            :cy="item.end.y"
            r="5"
            :style="{ fill: item.color }"
          />
        </g>
      </svg>
      <span class="axis axis-x">{{ labels[projection][0] }}</span>
      <span class="axis axis-y">{{ labels[projection][1] }}</span>
      <span class="range range-min-a">{{ meters(plot.minA) }}</span>
      <span class="range range-max-a">{{ meters(plot.maxA) }}</span>
      <span class="range range-min-b">{{ meters(plot.minB) }}</span>
      <span class="range range-max-b">{{ meters(plot.maxB) }}</span>
    </div>
  </div>
</template>

<style scoped>
.trajectory-wrap { min-width: 0; }
.plot-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  color: var(--ink-muted);
  font-size: 11px;
}
.projection-tabs { display: flex; gap: 4px; padding: 4px; border-radius: 12px; background: #e9edec; }
.projection-tabs button {
  min-width: 38px;
  padding: 6px 8px;
  border: 0;
  border-radius: 9px;
  color: #78858a;
  background: transparent;
  cursor: pointer;
  font-size: 11px;
  font-weight: 800;
}
.projection-tabs button.active {
  color: #405761;
  background: #fff;
  box-shadow: 0 3px 10px rgba(54, 70, 78, 0.08);
}
.canvas-shell {
  position: relative;
  overflow: hidden;
  border: 1px solid #dfe5e3;
  border-radius: 22px;
  background: #fbfcfa;
}
svg { display: block; width: 100%; height: auto; min-height: 280px; }
.grid-lines line { stroke: #e3e8e6; stroke-width: 1; stroke-dasharray: 3 7; }
.route-underlay {
  fill: none;
  stroke: rgba(255, 255, 255, 0.82);
  stroke-width: 6;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.route {
  fill: none;
  stroke-width: 2.8;
  stroke-linecap: round;
  stroke-linejoin: round;
  opacity: 0.88;
}
.start-marker { fill: #fff; stroke-width: 2.5; }
.end-marker { stroke: #fff; stroke-width: 2; }
.axis, .range { position: absolute; color: #89959a; font-size: 10px; font-weight: 800; }
.axis-x { right: 14px; bottom: 8px; }
.axis-y { top: 10px; left: 13px; }
.range-min-a { bottom: 9px; left: 42px; }
.range-max-a { right: 42px; bottom: 9px; }
.range-min-b { bottom: 34px; left: 8px; writing-mode: vertical-rl; }
.range-max-b { top: 34px; left: 8px; writing-mode: vertical-rl; }
</style>
