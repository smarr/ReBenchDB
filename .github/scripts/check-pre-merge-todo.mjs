import fs from 'node:fs';

const todoFile = 'TODO-pre-merge.md';

if (!fs.existsSync(todoFile)) {
  console.log(`${todoFile} does not exist. Pre-merge TODO check passed.`);
  process.exit(0);
}

const content = fs.readFileSync(todoFile, 'utf8');
const lines = content.split(/\r?\n/);

let incompleteTasks = 0;
const reportLines = [];

for (let i = 0; i < lines.length; i += 1) {
  const line = lines[i];
  if (/^\s*-\s*\[\s\]/.test(line)) {
    const taskText = line.replace(/^\s*-\s*\[\s+\]\s*/, '').trim();
    incompleteTasks += 1;
    reportLines.push(line);
  } else if (line.startsWith('#')) {
    reportLines.push(line);
  }
}

reportLines.push('Pre-merge TODO check failed.');
reportLines.push(`File exists: ${todoFile}`);

const report = reportLines.join('\n');
console.error(report);

const summaryPath = process.env.GITHUB_STEP_SUMMARY;
if (summaryPath) {
  fs.appendFileSync(summaryPath, '## Pre-merge TODO Check\n\n');
  fs.appendFileSync(summaryPath, '\n');
  fs.appendFileSync(summaryPath, `${report}\n`);
  fs.appendFileSync(summaryPath, '\n');
}

// Intentionally fail while the pre-merge TODO file still exists.
process.exit(1);
