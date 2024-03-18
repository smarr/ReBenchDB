import { readFileSync } from 'node:fs';

const data = JSON.parse(readFileSync('actual.json', 'utf-8'));

let allCorrect = true;

function assert(values, criterion, step) {
  for (let i = 1; i < values.length; i += 1) {
    const val = values[i];
    if (i % step === 0) {
      console.assert(
        val === i,
        `${criterion} at ${i}: Expected ${i}, got ${val}`
      );
      allCorrect = allCorrect && val === i;
    } else {
      console.assert(
        val == null,
        `${criterion} at ${i}: Expected null, got ${val}`
      );
      allCorrect = allCorrect && val == null;
    }
  }
}

const byCriterion = { mem: [], compile: [], total: [] };

for (const e of data) {
  byCriterion[e.criterion][e.iteration] = e.value;
}

for (const [c, step] of [
  ['mem', 3],
  ['compile', 7],
  ['total', 1]
]) {
  assert(byCriterion[c], c, step);
}

if (allCorrect) {
  process.exit(0);
} else {
  process.exit(1);
}
