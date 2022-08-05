import { readFileSync } from 'fs';
import { getDirname } from '../util.js';
import { BenchmarkData } from '../api.js';
import { createAndInitializeDB, TestDatabase } from '../../tests/db-testing.js';
import { Benchmark } from './benchmark.js';

const __dirname = getDirname(import.meta.url);
export class RebenchDbBenchmark extends Benchmark {
  protected readonly testData: BenchmarkData;
  protected db: TestDatabase | null;
  protected problemSize: string;

  constructor() {
    super();
    this.db = null;
    this.problemSize = '';

    this.testData = JSON.parse(
      readFileSync(`${__dirname}/../../../tests/large-payload.json`).toString()
    );
  }

  public async oneTimeSetup(problemSize: string): Promise<void> {
    this.problemSize = problemSize;
    this.db = await createAndInitializeDB('rdb_benchmark', 100, false, false);

    if (!this.db) {
      throw new Error('ReBenchDB connection was not initialized');
    }

    if (problemSize === 'large') {
      // just use the testData as is
    } else if (problemSize === 'medium') {
      this.testData.data.length = 20;
      for (const run of this.testData.data) {
        if (run.d) {
          run.d.length = 200;
        }
      }
    } else if (problemSize === 'small') {
      this.testData.data.length = 10;
      for (const run of this.testData.data) {
        if (run.d) {
          run.d.length = 15;
        }
      }
    } else {
      throw new Error('Unsupported problem size given: ' + problemSize);
    }
  }

  public async oneTimeTeardown(): Promise<void> {
    if (this.db) {
      return this.db?.close();
    }
  }
}
