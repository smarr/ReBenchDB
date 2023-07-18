import Decimal from 'decimal.js';

/**
 * Calculate a full-precision sum.
 * We avoid loss of precision from IEEE doubles by tracking intermediate sums.
 *
 * The implementation takes inspiration from
 * https://code.activestate.com/recipes/393090/
 * and
 * https://github.com/d3/d3-array/blob/
 * 6fda2773d31c2b3377d8b2dbd11a3e334a7cbc9e/src/fsum.js
 *
 * @param values an array of doubles to be summed up
 * @returns sum, with full precision
 */
export function fullPrecisionSum(values: number[]): number {
  const partials = new Float64Array(32);
  let n = 0;

  for (let x of values) {
    let i = 0;
    for (let j = 0; j < n && j < 32; j += 1) {
      const y = partials[j],
        hi = x + y,
        lo = Math.abs(x) < Math.abs(y) ? x - (hi - y) : y - (hi - x);
      if (lo) {
        partials[i] = lo;
        i += 1;
      }
      x = hi;
    }
    partials[i] = x;
    n = i + 1;
  }

  let x: number;
  let y: number;
  let lo = 0;
  let hi = 0;

  if (n > 0) {
    n -= 1;
    hi = partials[n];

    while (n > 0) {
      x = hi;
      n -= 1;
      y = partials[n];
      hi = x + y;
      lo = y - (hi - x);
      if (lo) {
        break;
      }
    }

    if (
      n > 0 &&
      ((lo < 0 && partials[n - 1] < 0) || (lo > 0 && partials[n - 1] > 0))
    ) {
      y = lo * 2;
      x = hi + y;
      if (y == x - hi) {
        hi = x;
      }
    }
  }
  return hi;
}

export function basicSum(iterable: number[]): number {
  let sum = 0.0;

  for (const i of iterable) {
    sum += i;
  }

  return sum;
}

export function preciseMean(data: number[]): number {
  return fullPrecisionSum(data) / data.length;
}

function randRange(stop: number) {
  return Math.floor(Math.random() * stop);
}

export function bootstrapSampleWithReplacement(data: number[]): number[] {
  const n = data.length;
  const result = new Array(n);
  for (let i = 0; i < n; i += 1) {
    result[i] = data[randRange(n)];
  }

  return result;
}

export function bootstrapMeans(data: number[], iterations = 1000): number[] {
  const means = new Array(iterations);

  for (let i = 0; i < iterations; i += 1) {
    const values = bootstrapSampleWithReplacement(data);
    means[i] = preciseMean(values);
  }

  means.sort((a, b) => a - b);
  return means;
}

export interface ConfidenceTriple {
  low: number;
  mid: number | [number] | [number, number];
  high: number;
}

function medianIndices(length: number): [number] | [number, number] {
  const midIndex = Math.floor(length / 2);
  if (length % 2 == 0) {
    return [midIndex - 1, midIndex];
  } else {
    return [midIndex];
  }
}

/**
 * Return the indexes into an array of the given length, at which the confidence
 * values for the desired confidence level can be found.
 *
 * @param length of the array
 * @param confidenceLevel the desired level
 * @returns object with the indexes into a data array
 */
export function confidenceSliceIndicesFast(
  length: number,
  confidenceLevel: number
): ConfidenceTriple {
  const exclude = (1 - confidenceLevel) / 2;

  const meanIndices = medianIndices(length);

  const lower = Math.floor(exclude * length);
  const upper = Math.ceil((1 - exclude) * length);

  return { low: lower, mid: meanIndices, high: upper };
}

const one = new Decimal('1');
const two = new Decimal('2');

/**
 * Return the indexes into an array of the given length, at which the confidence
 * values for the desired confidence level can be found.
 *
 * @param length of the array
 * @param confidenceLevel the desired level
 * @returns object with the indexes into a data array
 */
export function confidenceSliceIndicesPrecise(
  length: number,
  confidenceLevel = new Decimal('0.95')
): ConfidenceTriple {
  if (typeof confidenceLevel === 'string') {
    confidenceLevel = new Decimal(confidenceLevel);
  }

  const exclude = one.minus(confidenceLevel).dividedBy(two);
  const midIndex = Math.floor(length / 2);

  let meanIndices: [number] | [number, number];
  if (length % 2 == 0) {
    meanIndices = [midIndex - 1, midIndex];
  } else {
    meanIndices = [midIndex];
  }

  const l = new Decimal(length);
  const lower = exclude.times(l).floor().toNumber();
  const upper = one.minus(exclude).times(l).ceil().toNumber();

  return { low: lower, mid: meanIndices, high: upper };
}

/**
 * Return the indexes into an array of the given length,
 * at which the confidence values for the 95th percentile can be found.
 *
 * @param length of the array
 * @returns object with the indexes into a data array
 */
export function confidence95SliceIndices(length: number): ConfidenceTriple {
  return confidenceSliceIndicesFast(length, 0.95);
}

function medianWithIndices(
  sortedData: number[],
  indices: [number] | [number, number]
): number {
  const [midIdx1, midIdx2] = indices;

  if (midIdx2 === undefined) {
    return sortedData[midIdx1];
  } else {
    return preciseMean([sortedData[midIdx1], sortedData[midIdx2]]);
  }
}

export function median(sortedData: number[]): number {
  return medianWithIndices(sortedData, medianIndices(sortedData.length));
}

export function medianUnsorted(data: number[]): number {
  const sortedData = data.slice().sort((a, b) => a - b);
  return median(sortedData);
}

/**
 * Return the indexes into an array of the given length, at which the confidence
 * values for the desired confidence level can be found.
 *
 * @param length of the array
 * @param confidence the desired level
 * @returns object with the indexes into a data array
 */
export function confidenceSliceIndices(
  length: number,
  confidence = '0.95'
): ConfidenceTriple {
  if (confidence === '0.95') {
    return confidence95SliceIndices(length);
  }
  return confidenceSliceIndicesPrecise(length, new Decimal(confidence));
}

/**
 * Determine the confidence triple from the bootstrapped means
 * for the requested confidence level.
 *
 * @param means array of numbers, will be sorted afterwards
 * @param confidence confidence level, as string to avoid float imprecision
 * @returns lower bound, median, and upper bound of the confidence interval
 */
export function confidenceSlice(
  means: number[],
  confidence = '0.95'
): ConfidenceTriple {
  means.sort((a, b) => a - b);

  // if there's an even number of means, we need to compute the median
  const { low, mid, high } = confidenceSliceIndices(means.length, confidence);
  const med = medianWithIndices(means, <[number, number]>mid);

  return {
    low: means[low],
    mid: med,

    // the upper bound is exclusive, i.e., possibly outside of the array
    high: means[high - 1]
  };
}

/**
 * Compute the confidence interval based on the bootstrapped mean of the data.
 *
 * @param data array of numbers
 * @param iterations number of bootstrap iterations
 * @param confidence confidence level, as string to avoid float imprecision
 * @returns
 */
export function bootstrapConfidenceInterval(
  data: number[],
  iterations = 1000,
  confidence = '0.95'
): ConfidenceTriple {
  const means = bootstrapMeans(data, iterations);
  return confidenceSlice(means, confidence);
}

/** Summarizing measurements. */
export interface BasicSummaryStatistics {
  min: number;
  max: number;
  median: number;
}

export interface SummaryStatsWithUnit extends BasicSummaryStatistics {
  unit: string;
}

/** Summarizing a single benchmark. */
export interface SummaryStatistics extends BasicSummaryStatistics {
  standardDeviation: number;
  mean: number;
  numberOfSamples: number;
  bci95low: number;
  bci95up: number;
}

export interface ComparisonStatistics {
  median: number;
  samples: number;
  change_m: number;
}

export interface ComparisonStatsWithUnit {
  data: ComparisonStatistics[];
  unit: string;
}

export function preciseVariance(data: number[]): number {
  return preciseVarianceWithMean(data, preciseMean(data));
}

export function preciseVarianceWithMean(
  data: number[],
  precomputedMean: number
): number {
  const squareDiff = data.map((x) => (x - precomputedMean) ** 2);
  return fullPrecisionSum(squareDiff) / (data.length - 1);
}

export function standardDeviation(data: number[]): number {
  return Math.sqrt(preciseVariance(data));
}

export function standardDeviationWithMean(
  data: number[],
  precomputedMean: number
): number {
  return Math.sqrt(preciseVarianceWithMean(data, precomputedMean));
}

export function calculateSummaryStatistics(
  data: number[],
  iterations = 1000
): SummaryStatistics {
  data.sort((a, b) => a - b);
  const { low, high } = bootstrapConfidenceInterval(data, iterations, '0.95');

  const mean = preciseMean(data);
  const med = median(data);

  return {
    min: data[0],
    max: data[data.length - 1],
    standardDeviation: standardDeviationWithMean(data, mean),
    mean,
    median: med,
    numberOfSamples: data.length,
    bci95low: low,
    bci95up: high
  };
}

/**
 * @param data - an unsorted array of numbers
 */
export function calculateBasicStatistics(
  data: number[]
): BasicSummaryStatistics {
  data.sort((a, b) => a - b);
  const min = data[0];
  const max = data[data.length - 1];
  const m = median(data);

  return { min, max, median: m };
}

/**
 * @param baseSorted is expected to be sorted, from lowest to highest value
 * @param changeSorted is expected to be sorted, from lowest to highest value
 */
export function calculateChangeStatistics(
  baseSorted: number[],
  changeSorted: number[]
): ComparisonStatistics {
  if (!isSorted(baseSorted) || !isSorted(changeSorted)) {
    throw new Error('Input arrays must be sorted.');
  }

  const baseMedian = median(baseSorted);
  const changeMedian = median(changeSorted);

  if (baseMedian === 0.0) {
    return {
      median: changeMedian,
      samples: baseSorted.length,
      change_m: 0.0
    };
  }

  return {
    median: changeMedian,
    samples: baseSorted.length,
    change_m: changeMedian / baseMedian - 1.0
  };
}

export function isSorted(values: number[]): boolean {
  for (let i = 1; i < values.length; i += 1) {
    if (values[i - 1] > values[i]) {
      return false;
    }
  }
  return true;
}

export function calculateChangeStatisticsForFirstAsBaseline(
  sorted: number[][]
): ComparisonStatistics[] {
  for (const series of sorted) {
    if (!isSorted(series)) {
      throw new Error('Input arrays must be sorted.');
    }
  }

  const result: ComparisonStatistics[] = [];

  const baseMedian = median(sorted[0]);

  for (const series of sorted) {
    const changeMedian = median(series);

    if (baseMedian === 0.0) {
      result.push({
        median: changeMedian,
        samples: series.length,
        change_m: 0.0
      });
    } else {
      result.push({
        median: changeMedian,
        samples: series.length,
        change_m: changeMedian / baseMedian - 1.0
      });
    }
  }

  return result;
}

export function normalize(data: number[], unitValue: number): number[] {
  return data.map((x) => x / unitValue);
}

export function calculateSummaryOfChangeSummaries(
  perCriteria: Map<string, ComparisonStatsWithUnit>
): Record<string, SummaryStatsWithUnit> {
  const result: Record<string, SummaryStatsWithUnit> = {};
  for (const [key, stats] of perCriteria.entries()) {
    const changeMedians = stats.data.map((x) => x.change_m);
    result[key] = {
      ...calculateBasicStatistics(changeMedians),
      unit: stats.unit
    };
  }
  return result;
}
