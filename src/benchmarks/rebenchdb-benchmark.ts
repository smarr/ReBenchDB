import { BenchmarkData } from '../shared/api.js';
import {
  closeMainDb,
  createAndInitializeDB,
  TestDatabase
} from '../../tests/backend/db/db-testing.js';
import { Benchmark } from './benchmark.js';
import { loadLargePayload } from '../../tests/payload.js';

export function reduceData(
  bd: BenchmarkData,
  maxRuns: number,
  maxMeasurements: number
): void {
  bd.data = bd.data.slice(0, maxRuns);
  for (const run of bd.data) {
    for (const d of run.d || []) {
      for (const i in d.m) {
        if (d.m[i] !== null) {
          d.m[i] = d.m[i]!.slice(0, maxMeasurements);
        }
      }
    }
  }
}

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

    this.testData = loadLargePayload();
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
