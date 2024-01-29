// This code is derived from the SOM benchmarks, see AUTHORS.md file.
//
// Copyright (c) 2015-2016 Stefan Marr <git@stefan-marr.de>
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the 'Software'), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.
import { reportConnectionRefused } from '../shared/errors.js';
import type { Benchmark } from './benchmark.js';

class IncorrectResultError extends Error {
  constructor() {
    super('Benchmark failed with incorrect result');
  }
}

class Run {
  public numIterations: number;
  public innerIterations: number;
  public problemSize: string;

  private total: number;
  private benchmarkSuite;
  private readonly name: string;

  constructor(name: string) {
    this.name = name;

    this.numIterations = 1;
    this.innerIterations = 1;
    this.total = 0;
    this.problemSize = '';
  }

  public async loadBenchmark() {
    const filename = './' + this.name.toLowerCase() + '.js';
    this.benchmarkSuite = await import(filename);
  }

  private reportBenchmark() {
    process.stdout.write(
      this.name +
        ': iterations=' +
        this.numIterations +
        ' average: ' +
        Math.round(this.total / this.numIterations) +
        'us total: ' +
        Math.round(this.total) +
        'us\n\n'
    );
  }

  private printResult(runTime: number) {
    process.stdout.write(
      this.name + ': iterations=1 runtime: ' + Math.round(runTime) + 'us\n'
    );
  }

  private async measure(bench: Benchmark) {
    const startTime = process.hrtime();
    const result = await bench.innerBenchmarkLoop(this.innerIterations);
    if (!result) {
      throw new IncorrectResultError();
    }
    const diff = process.hrtime(startTime);

    // truncate to integer
    const runTime = ((diff[0] * 1e9 + diff[1]) / 1000) | 0;

    this.printResult(runTime);
    this.total += runTime;
  }

  private async doRuns(bench: Benchmark) {
    for (let i = 0; i < this.numIterations; i++) {
      await this.measure(bench);
    }
  }

  public printTotal() {
    process.stdout.write(`Total Runtime: ${this.total}us\n`);
  }

  public async runBenchmark() {
    process.stdout.write(`Starting ${this.name} benchmark ...\n`);

    const benchmark: Benchmark = new this.benchmarkSuite.default();

    try {
      await benchmark.oneTimeSetup(this.problemSize);
      await this.doRuns(benchmark);
    } catch (e: any) {
      if (e.code == 'ECONNREFUSED') {
        reportConnectionRefused(e);
      }
    } finally {
      await benchmark.oneTimeTeardown();
    }

    this.reportBenchmark();
    process.stdout.write('\n');
  }
}

async function processArguments(args) {
  const run = new Run(args[2]);
  await run.loadBenchmark();

  if (args.length > 3) {
    run.numIterations = parseInt(args[3]);
    if (args.length > 4) {
      run.innerIterations = parseInt(args[4]);
      if (args.length > 5) {
        run.problemSize = args[5];
      }
    }
  }
  return run;
}

function printUsage() {
  process.stdout.write(
    'harness.js [benchmark] [num-iterations [inner-iter [problem-size]]]\n'
  );
  process.stdout.write('\n');
  process.stdout.write('  benchmark      - benchmark class name\n');
  process.stdout.write(
    '  num-iterations - number of times to execute benchmark, default: 1\n'
  );
  process.stdout.write(
    '  inner-iter     -' +
      ' number of times the benchmark is executed in an inner loop,\n'
  );
  process.stdout.write(
    '                   which is measured in total, default: 1\n'
  );
  process.stdout.write(
    '  problem-size   -' +
      ` a problem size to be given to the benchmark, default: ''\n`
  );
}

if (process.argv.length < 3) {
  printUsage();
  process.exit(1);
}

const run = await processArguments(process.argv);

try {
  await run.runBenchmark();
  run.printTotal();
} catch (e: any) {
  console.error(e.message);
  process.exit(1);
}
