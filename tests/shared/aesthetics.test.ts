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

describe('getColorsForExecutors()', () => {
  it('should assign colors to executors', () => {
    const executors = new Set(['exe1', 'exe2', 'exe3', 'exe4']);
    const colors = siteAesthetics.getColorsForExecutors(executors);
    expect(colors.get('exe1')).toEqual(siteAesthetics.exeColors[0]);
    expect(colors.get('exe2')).toEqual(siteAesthetics.exeColors[1]);
    expect(colors.get('exe3')).toEqual(siteAesthetics.exeColors[2]);
    expect(colors.get('exe4')).toEqual(siteAesthetics.exeColors[3]);
  });

  it('should get color even if there are more executors than colors', () => {
    const executors: Set<string> = new Set();
    for (let i = 0; i < siteAesthetics.exeColors.length + 2; i++) {
      executors.add(`exe${i}`);
    }
    const colors = siteAesthetics.getColorsForExecutors(executors);
    for (let i = 0; i < siteAesthetics.exeColors.length + 2; i++) {
      expect(colors.get(`exe${i}`)).toEqual(
        siteAesthetics.exeColors[i % siteAesthetics.exeColors.length]
      );
    }
  });
});
