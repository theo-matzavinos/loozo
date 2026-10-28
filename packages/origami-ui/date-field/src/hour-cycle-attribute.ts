/**
 * A time root's or a date-time root's `hourCycle` input coercion: a static `hourCycle="24"`
 * attribute is the number.
 */
export function hourCycleAttribute(value: 12 | 24 | "12" | "24" | null): 12 | 24 | null {
  if (value === 12 || value === "12") {
    return 12;
  }

  if (value === 24 || value === "24") {
    return 24;
  }

  return null;
}
