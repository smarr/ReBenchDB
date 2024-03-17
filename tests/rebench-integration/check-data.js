import { readFileSync } from 'node:fs';

const data = JSON.parse(readFileSync('actual.json', 'utf-8'));

let allCorrect = true;

function assert(values, criterion, step) {
  for (let i = 1; i < values.length + 1; i += 1) {
    const val = values[i - 1];
    if (i % step === 0) {
      console.assert(
        val === i,
        `${criterion} at ${i}: Expected ${i}, got ${val}`
      );
      allCorrect = allCorrect && val === i;
    } else {
      console.assert(
        val === null,
        `${criterion} at ${i}: Expected null, got ${val}`
      );
      allCorrect = allCorrect && val === null;
    }
  }
}

for (const e of data) {
  if (e.criterion === 'mem') {
    assert(e.values, e.criterion, 3);
  } else if (e.criterion === 'compile') {
    assert(e.values, e.criterion, 7);
  } else if (e.criterion === 'total') {
    assert(e.values, e.criterion, 1);
  }
}

if (allCorrect) {
  process.exit(0);
} else {
  process.exit(1);
}
