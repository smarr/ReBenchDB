import { describe, expect, it } from '@jest/globals';

import { isSvgEqualWithinTolerance } from './helpers.js';

describe('isSvgEqualWithinTolerance()', () => {
  const svg = '<path d="M 416.171875 39.101562 L 42.648438 7 "/>';

  it('should accept numbers that differ by one step of 1/256', () => {
    // as seen between glyph paths rendered on x86_64 and arm64
    const other = '<path d="M 416.171875 39.101562 L 42.644531 7 "/>';
    expect(isSvgEqualWithinTolerance(svg, other)).toBe(true);
  });

  it('should reject numbers that differ by more', () => {
    const other = '<path d="M 416.171875 39.101562 L 42.640625 7 "/>';
    expect(isSvgEqualWithinTolerance(svg, other)).toBe(false);
  });

  it('should reject differences in anything but numbers', () => {
    const other = '<path d="M 416.171875 39.101562 C 42.648438 7 "/>';
    expect(isSvgEqualWithinTolerance(svg, other)).toBe(false);
  });

  it('should reject a different number of numbers', () => {
    const other = '<path d="M 416.171875 39.101562 L 42.648438 7 8 "/>';
    expect(isSvgEqualWithinTolerance(svg, other)).toBe(false);
  });
});
