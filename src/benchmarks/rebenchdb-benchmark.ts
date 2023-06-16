import { readFileSync } from 'fs';
import { getDirname } from '../backend/util.js';
import { BenchmarkData } from '../shared/api.js';
import {
  closeMainDb,
  createAndInitializeDB,
  TestDatabase
} from '../../tests/db-testing.js';
import { Benchmark } from './benchmark.js';

const __dirname = getDirname(import.meta.url);
export class RebenchDbBenchmark extends Benchmark {
  protected readonly testData: BenchmarkData;
  protected db: TestDatabase | null;
  protected problemSize: string;
  protected enableTimeline: boolean;

  constructor() {
    super();
    this.db = null;
    this.problemSize = '';
    this.enableTimeline = false;

    this.testData = JSON.parse(
      readFileSync(`${__dirname}/../../../tests/large-payload.json`).toString()
    );
  }

  public async oneTimeSetup(problemSize: string): Promise<void> {
    this.problemSize = problemSize;
    this.db = await createAndInitializeDB(
      'rdb_benchmark',
      100,
      this.enableTimeline,
      false
    );

    if (!this.db) {
      throw new Error('ReBenchDB connection was not initialized');
    }
  }

  public async oneTimeTeardown(): Promise<void> {
    if (this.db) {
      await this.db?.close();
      await closeMainDb();
    }
  }
}
