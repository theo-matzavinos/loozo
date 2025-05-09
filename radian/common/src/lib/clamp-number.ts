export function clampNumber(
  value: number,
  [min, max]: [number, number],
): number {
  return Math.min(max, Math.max(min, value));
}
