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
  }

  public async oneTimeTeardown(): Promise<void> {
    if (this.db) {
      return this.db?.close();
    }
  }
}
