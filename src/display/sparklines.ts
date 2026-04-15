// Sparkline characters from lowest to highest density
const SPARK_CHARS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

// Generate a sparkline string from an array of numbers.
// Each number maps to a bar character proportional to its value relative to max.
// Returns empty string for empty or all-zero arrays.
export function sparkline(numbers: number[]): string {
  if (numbers.length === 0) return '';

  const max = numbers.reduce((a, b) => a > b ? a : b, 0);
  if (max === 0) return SPARK_CHARS[0].repeat(numbers.length);

  return numbers
    .map(n => {
      const ratio = n / max;
      const index = Math.min(
        SPARK_CHARS.length - 1,
        Math.floor(ratio * SPARK_CHARS.length)
      );
      return SPARK_CHARS[index];
    })
    .join('');
}
