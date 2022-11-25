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

  means.sort();
  return means;
}

export function confidence_slice() {

}