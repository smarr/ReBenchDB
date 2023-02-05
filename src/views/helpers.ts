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

/**
 * Remove a prefix from a string.
 */
export function withoutStart(prefix: string, str: string): string {
  if (str.startsWith(prefix)) {
    return str.slice(prefix.length);
  }
  return str;
}

/**
 * Return a string based on the iteration a loop is in.
 */
export class PerIterationOutput {
  private readonly first: string;
  private readonly allButFirst: string;

  private isFirst: boolean;

  constructor(first: string, allButFirst: string) {
    this.first = first;
    this.allButFirst = allButFirst;
    this.isFirst = true;
  }

  public next(): string {
    if (this.isFirst) {
      this.isFirst = false;
      return this.first;
    }
    return this.allButFirst;
  }
}
