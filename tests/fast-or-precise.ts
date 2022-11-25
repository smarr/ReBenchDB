import Decimal from 'decimal.js';
import {
  confidenceSliceIndicesFast,
  confidenceSliceIndicesPrecise
} from '../src/stats.js';

const confidenceLevels = ['0.8', '0.85', '0.9', '0.99', '0.999', '0.99999'];

for (let i = 1; i <= 7; i += 1) {
  confidenceLevels.push('0.' + i);
  confidenceLevels.push('0.' + i + '5');
}

const differences: any = [];

for (const level of confidenceLevels) {
  const levelPrecise = new Decimal(level);
  const levelFast = parseFloat(level);
  const diffs: number[] = [];

  for (let i = 1; i < 100_000; i += 1) {
    const fast = confidenceSliceIndicesFast(i, levelFast);
    const precise = confidenceSliceIndicesPrecise(i, levelPrecise);

    if (
      fast.lower !== precise.lower ||
      fast.mean[0] !== precise.mean[0] ||
      fast.mean[1] !== precise.mean[1] ||
      fast.upper !== precise.upper
    ) {
      // differences.push({
      //   level,
      //   i,
      //   fast,
      //   fastMean: fast.mean,
      //   precise,
      //   preciseMean: precise.mean
      // });
      // break;
      diffs.push(i);
    }
  }

  if (diffs.length > 0) {
    differences.push({ level, diffs });
  }
}

console.log(differences);
