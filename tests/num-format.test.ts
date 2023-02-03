import { asHumanHz, asHumanMem, per, r0, r2 } from '../src/num-format';

describe('Format Functions for Numerical Values', () => {
  describe('r0 - round to 0 decimal places', () => {
    it('should round correctly', () => {
      expect(r0(0)).toBe('0');
      expect(r0(1.0)).toBe('1');
      expect(r0(1.1)).toBe('1');
      expect(r0(1.9)).toBe('2');
      expect(r0(1.99)).toBe('2');
      expect(r0(1.49)).toBe('1');
      expect(r0(1.5)).toBe('2');
    });
  });

  describe('r2 - round to 2 decimal places', () => {
    it('should round correctly', () => {
      expect(r2(0)).toBe('0.00');
      expect(r2(1.0)).toBe('1.00');
      expect(r2(1.1111)).toBe('1.11');
      expect(r2(1.999)).toBe('2.00');
      expect(r2(1.49)).toBe('1.49');
      expect(r2(1.499)).toBe('1.50');
      expect(r2(1.5)).toBe('1.50');
    });
  });

  describe('per - as percentage', () => {
    it('should return the number as a string with a percentage value', () => {
      expect(per(0)).toBe('0');
      expect(per(0.5)).toBe('50');
      expect(per(0.499)).toBe('50');
    });
  });

  describe('asHumanMem - memory value rounded to an appropriate unit', () => {
    it('should return the number as a string with a memory value', () => {
      expect(asHumanMem(0, 3)).toBe('0.000b');
      expect(asHumanMem(1, 3)).toBe('1.000b');
      expect(asHumanMem(1024, 3)).toBe('1.000kb');
      expect(asHumanMem(1024 * 1024, 3)).toBe('1.000MB');
      expect(asHumanMem(1024 * 1024 * 1024, 3)).toBe('1.000GB');
      expect(asHumanMem(1024 * 1024 * 1024 * 1024, 3)).toBe('1024.000GB');
    });

    it('should round as requested', () => {
      expect(asHumanMem(0, 0)).toBe('0b');
      expect(asHumanMem(1, 0)).toBe('1b');
      expect(asHumanMem(1024, 0)).toBe('1kb');
      expect(asHumanMem(1024 * 1024, 0)).toBe('1MB');
      expect(asHumanMem(1024 * 1024 * 1024, 0)).toBe('1GB');
      expect(asHumanMem(1024 * 1024 * 1024 * 1024, 0)).toBe('1024GB');
    });

    it('should round to 0 digits as default', () => {
      expect(asHumanMem(0)).toBe('0b');
      expect(asHumanMem(1)).toBe('1b');
      expect(asHumanMem(1024)).toBe('1kb');
      expect(asHumanMem(1024 * 1024)).toBe('1MB');
      expect(asHumanMem(1024 * 1024 * 1024)).toBe('1GB');
      expect(asHumanMem(1024 * 1024 * 1024 * 1024)).toBe('1024GB');
    });
  });

  describe('asHumanHz - frequency value rounded to an appropriate unit', () => {
    it('should return the number as a string with a frequency value', () => {
      expect(asHumanHz(0, 3)).toBe('0.000Hz');
      expect(asHumanHz(1, 3)).toBe('1.000Hz');
      expect(asHumanHz(1000, 3)).toBe('1.000kHz');
      expect(asHumanHz(1000 * 1000, 3)).toBe('1.000MHz');
      expect(asHumanHz(1000 * 1000 * 1000, 3)).toBe('1.000GHz');
      expect(asHumanHz(1000 * 1000 * 1000 * 1000, 3)).toBe('1000.000GHz');
    });

    it('should round as requested', () => {
      expect(asHumanHz(0, 0)).toBe('0Hz');
      expect(asHumanHz(1, 0)).toBe('1Hz');
      expect(asHumanHz(1000, 0)).toBe('1kHz');
      expect(asHumanHz(1000 * 1000, 0)).toBe('1MHz');
      expect(asHumanHz(1000 * 1000 * 1000, 0)).toBe('1GHz');
      expect(asHumanHz(1000 * 1000 * 1000 * 1000, 0)).toBe('1000GHz');
    });

    it('should round to 0 digits as default', () => {
      expect(asHumanHz(0)).toBe('0Hz');
      expect(asHumanHz(1)).toBe('1Hz');
      expect(asHumanHz(1000)).toBe('1kHz');
      expect(asHumanHz(1000 * 1000)).toBe('1MHz');
      expect(asHumanHz(1000 * 1000 * 1000)).toBe('1GHz');
      expect(asHumanHz(1000 * 1000 * 1000 * 1000)).toBe('1000GHz');
    });
  });
});
