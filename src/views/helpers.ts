/**
 * Returns the common start of a list of strings.
 */
export function commonStringStart(strings: string[]): string {
  if (strings.length === 0) {
    return '';
  }

  const sorted = strings.sort();
  const n = Math.min(...sorted.map((s) => s.length));
  const first = sorted[0].slice(0, n);
  const last = sorted[sorted.length - 1].slice(0, n);

  let i = 0;
  while (i < n && first[i] === last[i]) {
    i += 1;
  }

  return first.slice(0, i);
}
