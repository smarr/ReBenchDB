/**
 * Round to 0 decimal places.
 */
export function r0(val: number): string {
  return val.toFixed(0);
}

/**
 * Round to 2 decimal places.
 */
export function r2(val: number): string {
  return val.toFixed(2);
}

/**
 * As percentage.
 */
export function per(val: number): string {
  return (val * 100).toFixed(0);
}

/**
 * As memory value rounded to an appropriate unit.
 */
export function asHumanMem(val: number, digits = 0): string {
  if (isNaN(val)) {
    return '';
  }

  let m = val;
  const mem = ['b', 'kb', 'MB', 'GB'];
  let i = 0;
  while (i < 3 && m >= 1024) {
    m = m / 1024;
    i += 1;
  }

  return `${m.toFixed(digits)}${mem[i]}`;
}

/**
 * As frequency value rounded to an appropriate unit.
 */
export function asHumanHz(val: number, digits = 0): string {
  if (isNaN(val)) {
    return '';
  }

  let h = val;
  const hz = ['Hz', 'kHz', 'MHz', 'GHz'];
  let i = 0;
  while (i < 3 && h >= 1000) {
    h = h / 1000;
    i += 1;
  }

  return `${h.toFixed(digits)}${hz[i]}`;
}
