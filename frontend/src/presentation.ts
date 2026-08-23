const algorithmPalette = [
  '#477b9d',
  '#5d927d',
  '#b7863c',
  '#766f91',
  '#9a6f55',
  '#527f87',
  '#8a6f86',
]

function hash(value: string): number {
  let result = 2166136261
  for (const character of value) {
    result ^= character.codePointAt(0) ?? 0
    result = Math.imul(result, 16777619)
  }
  return result >>> 0
}

export function algorithmColor(id: string): string {
  return algorithmPalette[hash(id) % algorithmPalette.length]!
}

export function algorithmIcon(name: string): string {
  const words = name.match(/[A-Za-z0-9]+/g) ?? []
  return (words.length > 1 ? words.slice(0, 2).map((word) => word[0]).join('') : name.slice(0, 2))
    .toUpperCase()
}
