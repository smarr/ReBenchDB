import { describe, expect, it } from '@jest/globals';
import { siteAesthetics } from '../../src/shared/aesthetics.js';

describe('lighten()', () => {
  it('should lighten a color', () => {
    expect(siteAesthetics.lighten('#2e3436')).toEqual('#555753');
    expect(siteAesthetics.lighten('#f57900')).toEqual('#fcaf3e');
    expect(siteAesthetics.lighten('#97c4f0')).toEqual('#daeeff');
  });

  it('should lighten a color, also if it does not start with a #', () => {
    expect(siteAesthetics.lighten('2e3436')).toEqual('#555753');
    expect(siteAesthetics.lighten('f57900')).toEqual('#fcaf3e');
    expect(siteAesthetics.lighten('97c4f0')).toEqual('#daeeff');
  });

  it('when lighten the last color, it should just stay the same', () => {
    expect(siteAesthetics.lighten('#daeeff')).toEqual('#daeeff');
    expect(siteAesthetics.lighten('#ffcccc')).toEqual('#ffcccc');
  });
});
