// The statistics a metric can report from its samples.

// The midpoint average for an even count.
export function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    return sorted[middle];
  }

  return (sorted[middle - 1] + sorted[middle]) / 2;
}

// Nearest rank: the smallest sample with at least q of the samples at or below it.
export function percentile(values, q) {
  const sorted = [...values].sort((a, b) => a - b);

  return sorted[Math.ceil(q * sorted.length) - 1];
}
