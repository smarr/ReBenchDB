import { describe, expect, it } from '@jest/globals';
import Decimal from 'decimal.js';
import {
  BasicSummaryStatistics,
  basicSum,
  bootstrapConfidenceInterval,
  bootstrapMeans,
  bootstrapSampleWithReplacement,
  calculateBasicStatistics,
  calculateChangeStatistics,
  calculateSummaryStatistics,
  ComparisonStatistics,
  confidence95SliceIndices,
  confidenceSlice,
  confidenceSliceIndices,
  confidenceSliceIndicesFast,
  confidenceSliceIndicesPrecise,
  fullPrecisionSum,
  preciseMean,
  standardDeviation,
  calculateSummaryOfChangeSummaries,
  normalize,
  ComparisonStatsWithUnit,
  isSorted,
  calculateChangeStatisticsForFirstAsBaseline
} from '../../src/shared/stats';

describe('basicSum()', () => {
  it('should produce the expected value', () => {
    const values: number[] = [];
    for (let i = 0; i < 10; i += 1) {
      values.push(7, 1e100, -7, -1e100, -9e-20, 8e-20);
    }
    expect(basicSum(values)).toBe(-1.0000000000000007e-20);
  });
});

describe('fullPrecisionSum()', () => {
  it('should work with known trivial values', () => {
    expect(fullPrecisionSum([1])).toBe(1.0);
    expect(fullPrecisionSum([6, 3, 7, 0, 1, 4])).toBe(21.0);
  });

  it('should work with integers', () => {
    const values = [0, 1, 10, 100, 1000, 10000, 100000, 1000000];
    expect(fullPrecisionSum(values)).toBe(1111111);
  });

  it('should work with large and small numbers', () => {
    const values: number[] = [];
    for (let i = 0; i < 10; i += 1) {
      values.push(7, 1e100, -7, -1e100, -9e-20, 8e-20);
    }

    expect(fullPrecisionSum(values)).toBe(-1.0000000000000007e-19);
  });

  function pushNTimes(arr: number[], val: number, times: number) {
    for (let i = 0; i < times; i += 1) {
      arr.push(val);
    }
    return arr;
  }

  it('should give exact sums', () => {
    expect(fullPrecisionSum(pushNTimes([], 0.1, 10))).toBe(1.0);

    const pos = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
    const neg = [-0.1, -0.2, -0.3, -0.4, -0.5, -0.6, -0.7, -0.8, -0.9, -1.0];
    for (let i = 0; i < pos.length; i += 1) {
      const arr = pushNTimes(pushNTimes([], pos[i], 10), neg[i], 10);
      expect(fullPrecisionSum(arr)).toBe(0.0);
    }
  });
});

describe('preciseMean()', () => {
  it('should work with known data', () => {
    expect(preciseMean([1.0])).toBe(1.0);
    expect(preciseMean([1.0, 1.0, 1.0])).toBe(1.0);
    expect(preciseMean([1.0, 2.0, 3.0])).toBe(2.0);
  });
});

describe('bootstrapSampleWithReplacement()', () => {
  it('should produce same number of data points from the input data', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];
    const output = bootstrapSampleWithReplacement(input);

    expect(output).toHaveLength(input.length);
    const outputSet = new Set(output);

    for (const val of outputSet) {
      expect(input.includes(val)).toBeTruthy();
    }
  });
});

describe('bootstrapMeans()', () => {
  it('should produce the right number of data points and mean', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];
    const means = bootstrapMeans(input, 1001);
    expect(means).toHaveLength(1001);

    expect(means[500]).toBeGreaterThanOrEqual(4.4);
    expect(means[500]).toBeLessThanOrEqual(4.6);
  });
});

describe('confidenceSliceIndices methods', () => {
  const ninetyFive = new Decimal('0.95');

  it('should produce same values for 0.95 confidence', () => {
    for (let i = 1; i < 10_000; i += 1) {
      const fast = confidenceSliceIndicesFast(i, 0.95);
      const precise = confidenceSliceIndicesPrecise(i, ninetyFive);
      expect(fast).toStrictEqual(precise);
    }
  });

  it('should produce same values for 0.99 confidence', () => {
    const ninetyNine = new Decimal('0.99');
    for (let i = 1; i < 10_000; i += 1) {
      const fast = confidenceSliceIndicesFast(i, 0.99);
      const precise = confidenceSliceIndicesPrecise(i, ninetyNine);
      expect(fast).toStrictEqual(precise);
    }
  });

  describe('confidence95SliceIndices()', () => {
    it('should produce the same values as the precise one', () => {
      for (let i = 1; i < 10_000; i += 1) {
        expect(confidence95SliceIndices(i)).toStrictEqual(
          confidenceSliceIndicesPrecise(i, ninetyFive)
        );
      }
    });
  });

  describe('confidenceSliceIndices()', () => {
    it('should determine the 0.95 indices for 1000 means', () => {
      const { low, mid, high } = confidenceSliceIndices(1000, '0.95');
      expect(low).toEqual(25);
      expect(mid).toEqual([499, 500]);
      expect(high).toEqual(975);
    });

    it('should determine the 0.95 indices for 1001 means', () => {
      const { low, mid, high } = confidenceSliceIndices(1001, '0.95');
      expect(low).toEqual(25);
      expect(mid).toEqual([500]);
      expect(high).toEqual(976);
    });

    it('should determine the indices for 0.8', () => {
      const { low, mid, high } = confidenceSliceIndices(10, '0.8');
      expect(low).toEqual(1);
      expect(mid).toEqual([4, 5]);
      expect(high).toEqual(9);
    });

    it('should determine the indices for 0.5', () => {
      const { low, mid, high } = confidenceSliceIndices(1001, '0.5');
      expect(low).toEqual(250);
      expect(mid).toEqual([500]);
      expect(high).toEqual(751);
    });
  });
});

describe('confidenceSlice()', () => {
  it('should produce the expected values', () => {
    const means: number[] = [];
    for (let x = 0; x < 1000; x += 1) {
      means.push(x + 15);
    }

    const lowIdx = 25; // based on the 1000 means for 0.95
    const highIdx = 975 - 1; // idx is exclusive

    const low = means[lowIdx];
    const high = means[highIdx];

    const mid = 514.5;

    const conf = confidenceSlice(means);
    expect(low).toEqual(conf.low);
    expect(mid).toEqual(conf.mid);
    expect(high).toEqual(conf.high);
  });

  it('should produce the expected values for values [0-9]', () => {
    const means = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const { low, mid, high } = confidenceSlice(means, '0.8');

    expect(low).toEqual(1);
    expect(mid).toEqual((4 + 5) / 2);
    expect(high).toEqual(8);
  });

  it('should produce the expected values for values [0-10]', () => {
    const means = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const { low, mid, high } = confidenceSlice(means, '0.8');

    expect(low).toEqual(1);
    expect(mid).toEqual(5);
    expect(high).toEqual(9);
  });
});

describe('bootstrapConfidenceInterval()', () => {
  it('should give the expected values for known inputs', () => {
    const data = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const { low, mid, high } = bootstrapConfidenceInterval(
      data,
      100000,
      '0.95'
    );
    expect(low).toBeGreaterThanOrEqual(2.5);
    expect(low).toBeLessThanOrEqual(2.8);

    expect(mid).toBeGreaterThanOrEqual(4.4);
    expect(mid).toBeLessThanOrEqual(4.6);

    expect(high).toBeGreaterThanOrEqual(6.2);
    expect(high).toBeLessThanOrEqual(6.5);
  });
});

describe('standardDeviation()', () => {
  it('should give the expected value for known input', () => {
    // taken from wikipedia
    const data = [2, 4, 4, 4, 5, 5, 7, 9];

    const mean = preciseMean(data);
    expect(mean).toEqual(5);

    const squareDiff = data.map((x) => (x - mean) ** 2);
    expect(squareDiff).toEqual([9, 1, 1, 1, 0, 0, 4, 16]);

    expect(standardDeviation(data)).toBeCloseTo(2.138, 3);
  });
});

describe('calculateSummaryStatistics()', () => {
  it('should produce expected values for known data', () => {
    const data: number[] = [];
    for (let i = 0; i < 1000; i += 1) {
      data.push(i);
    }

    const result = calculateSummaryStatistics(data);

    expect(result.min).toBe(0);
    expect(result.max).toBe(999);
    expect(result.standardDeviation).toBeCloseTo(288.819, 3);
    expect(result.mean).toBe(499.5);
    expect(result.median).toBeCloseTo(499.5, 2);
    expect(result.numberOfSamples).toBe(1000);

    expect(result.bci95low).toBeGreaterThanOrEqual(479);
    expect(result.bci95low).toBeLessThanOrEqual(485);
    expect(result.bci95up).toBeGreaterThanOrEqual(514);
    expect(result.bci95up).toBeLessThanOrEqual(520);
  });
});

describe('calculateBasicStatistics()', () => {
  it('should produce expected values for known data', () => {
    const data: number[] = [];
    for (let i = 0; i < 1000; i += 1) {
      data.push(i);
    }

    const stats: BasicSummaryStatistics = calculateBasicStatistics(data);

    expect(stats.min).toBe(0);
    expect(stats.max).toBe(999);
    expect(stats.median).toBeCloseTo(499.5, 2);
  });
});

describe('calculateChangeStatistics()', () => {
  it('should produce expected values for known data', () => {
    const stats: ComparisonStatistics = calculateChangeStatistics(
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
    );

    expect(stats.samples).toEqual(10);
    expect(stats.median).toEqual(4.5);
    expect(stats.change_m).toEqual(0);
  });

  it('should give result when base and change have different length', () => {
    const stats = calculateChangeStatistics(
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    );
    expect(stats.samples).toEqual(10);
    expect(stats.median).toEqual(5);
    expect(stats.change_m).toEqual(0.11111111111111116);
  });

  it('should error on unordered data', () => {
    expect(() => {
      calculateChangeStatistics(
        [0, 1, 2, 3, 4, 5, 6, 7, 8],
        [9, 8, 7, 6, 5, 4, 3, 2, 1]
      );
    }).toThrow('Input arrays must be sorted.');
  });

  it('should handle 0 values', () => {
    const stats: ComparisonStatistics = calculateChangeStatistics(
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0]
    );

    expect(stats.samples).toEqual(9);
    expect(stats.median).toEqual(0);
    expect(stats.change_m).toEqual(0);
  });
});

describe('isSorted()', () => {
  it('should return true for sorted arrays', () => {
    expect(isSorted([1, 2, 3, 4, 5])).toBeTruthy();
    expect(isSorted([1, 1, 1, 1, 1])).toBeTruthy();
    expect(isSorted([1, 1, 1, 2, 2, 2])).toBeTruthy();
    expect(isSorted([1, 1, 1, 2, 2, 2, 3, 3, 3])).toBeTruthy();
  });

  it('should return false for unsorted arrays', () => {
    expect(isSorted([1, 2, 3, 4, 5, 4])).toBeFalsy();
    expect(isSorted([1, 1, 1, 1, 1, 0])).toBeFalsy();
    expect(isSorted([1, 1, 1, 2, 2, 2, 2, 1])).toBeFalsy();
  });
});

describe('calculateChangeStatisticsForFirstAsBaseline()', () => {
  it('should produce expected values for known data', () => {
    const stats: ComparisonStatistics[] =
      calculateChangeStatisticsForFirstAsBaseline([
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
      ]);

    expect(stats[0].samples).toEqual(10);
    expect(stats[0].median).toEqual(4.5);
    expect(stats[0].change_m).toEqual(0);

    expect(stats[1].samples).toEqual(10);
    expect(stats[1].median).toEqual(4.5);
    expect(stats[1].change_m).toEqual(0);
  });

  it('should given an error when base and change have different length', () => {
    expect(() => {
      calculateChangeStatisticsForFirstAsBaseline([
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
      ]);
    }).toThrow(
      `All arrays must have the same length, ` +
        `but base has 10, while another has 11.`
    );
  });

  it('should error on unordered data', () => {
    expect(() => {
      calculateChangeStatisticsForFirstAsBaseline([
        [0, 1, 2, 3, 4, 5, 6, 7, 8],
        [9, 8, 7, 6, 5, 4, 3, 2, 1]
      ]);
    }).toThrow('Input arrays must be sorted.');
  });

  it('should handle 0 values', () => {
    const stats: ComparisonStatistics[] =
      calculateChangeStatisticsForFirstAsBaseline([
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0]
      ]);

    expect(stats[0].samples).toEqual(9);
    expect(stats[0].median).toEqual(0);
    expect(stats[0].change_m).toEqual(0);
  });

  it('a base of zero gives a zero change', () => {
    const stats: ComparisonStatistics[] =
      calculateChangeStatisticsForFirstAsBaseline([
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
        [1, 1, 1, 1, 1, 1, 1, 1, 1],
        [2, 2, 2, 2, 2, 2, 2, 2, 2]
      ]);

    expect(stats[0].samples).toEqual(9);
    expect(stats[0].median).toEqual(0);
    expect(stats[0].change_m).toEqual(0);

    expect(stats[1].samples).toEqual(9);
    expect(stats[1].median).toEqual(1);
    expect(stats[1].change_m).toEqual(0);

    expect(stats[2].samples).toEqual(9);
    expect(stats[2].median).toEqual(2);
    expect(stats[2].change_m).toEqual(0);
  });

  it('should handle many data series', () => {
    const stats: ComparisonStatistics[] =
      calculateChangeStatisticsForFirstAsBaseline([
        [1, 2, 3, 4, 5, 6, 7, 8, 9],
        [2, 3, 4, 5, 6, 7, 8, 9, 10],
        [3, 4, 5, 6, 7, 8, 9, 10, 11]
      ]);

    expect(stats[0].samples).toEqual(9);
    expect(stats[0].median).toEqual(5);
    expect(stats[0].change_m).toEqual(0);

    expect(stats[1].samples).toEqual(9);
    expect(stats[1].median).toEqual(6);
    expect(stats[1].change_m).toEqual(0.19999999999999996);

    expect(stats[2].samples).toEqual(9);
    expect(stats[2].median).toEqual(7);
    expect(stats[2].change_m).toEqual(0.3999999999999999);
  });
});

describe('normalize()', () => {
  it('should normalize a mixed array of numbers', () => {
    expect(normalize([1, 2, 4, 10], 2)).toEqual([0.5, 1, 2, 5]);
    expect(normalize([-1, -2, -4, -10], 2)).toEqual([-0.5, -1, -2, -5]);
  });
});

describe('calculateSummaryOfChangeSummaries()', () => {
  const perCriteria = new Map<string, ComparisonStatsWithUnit>();

  perCriteria.set('total', {
    data: [
      { samples: 10, median: 5, change_m: 10 },
      { samples: 10, median: 5, change_m: 11 },
      { samples: 10, median: 5, change_m: 12 },
      { samples: 10, median: 5, change_m: 13 },
      { samples: 10, median: 5, change_m: 14 }
    ],
    unit: 'ms'
  });

  perCriteria.set('criteria1', {
    data: [
      { samples: 10, median: 5, change_m: 3 },
      { samples: 10, median: 5, change_m: 2 },
      { samples: 10, median: 5, change_m: 1 }
    ],
    unit: 'ms'
  });

  const result = calculateSummaryOfChangeSummaries(perCriteria);

  it('should produce the expected values', () => {
    expect(result.total.median).toEqual(12);
    expect(result.total.min).toEqual(10);
    expect(result.total.max).toEqual(14);

    expect(result.criteria1.median).toEqual(2);
    expect(result.criteria1.min).toEqual(1);
    expect(result.criteria1.max).toEqual(3);
  });
});
