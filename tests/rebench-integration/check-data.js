import { readFileSync } from 'node:fs';

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

function getJsonData() {
  const data = JSON.parse(readFileSync('actual.json', 'utf-8'));

  const byCriterion = { mem: [], compile: [], total: [] };

  for (const e of data) {
    byCriterion[e.criterion][e.iteration] = e.value;
  }

  return byCriterion;
}

function getCsvData() {
  const data = readFileSync('actual.csv', 'utf-8');

  const lines = data.split('\n');
  const columnArr = lines.shift().split(',');
  const criterionIdx = columnArr.indexOf('criterion');
  const iterationIdx = columnArr.indexOf('iteration');
  const valueIdx = columnArr.indexOf('value');

  const byCriterion = { mem: [], compile: [], total: [] };

  for (const line of lines) {
    if (line === '') {
      continue;
    }
    const columns = line.split(',');
    byCriterion[columns[criterionIdx]][columns[iterationIdx]] = parseInt(
      columns[valueIdx]
    );
  }

  return byCriterion;
}

function check(byCriterion) {
  for (const [c, step] of [
    ['mem', 3],
    ['compile', 7],
    ['total', 1]
  ]) {
    assert(byCriterion[c], c, step);
  }
}

check(getJsonData());
check(getCsvData());

if (allCorrect) {
  process.exit(0);
} else {
  process.exit(1);
}
