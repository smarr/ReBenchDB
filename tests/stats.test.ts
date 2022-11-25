import {
  basicSum,
  bootstrapMeans,
  bootstrapSampleWithReplacement,
  fullPrecisionSum,
  preciseMean
} from '../src/stats';

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
    expect(means[500]).toBe(4.5);
  });
});
