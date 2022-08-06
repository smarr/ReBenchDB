import { dashResults } from '../dashboard.js';
import { RebenchDbBenchmark } from './rebenchdb-benchmark.js';

export default class RenderReport extends RebenchDbBenchmark {
  public async oneTimeSetup(problemSize: string): Promise<void> {
    await super.oneTimeSetup(problemSize);

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

    for (let i = 1; i <= 2; i += 1) {
      this.testData.experimentName = 'Benchmark ' + i;
      this.testData.source.commitId = 'commit-' + i;
      await this.db?.recordAllData(this.testData);
    }
  }

  public async benchmark(): Promise<any> {
    if (!this.db) {
      throw new Error('this.db not initialized');
    }
    this.db.getStatsCacheValidity().invalidateAndNew();
    return dashResults(1, this.db);
  }

  public verifyResult(result: any): boolean {
    if (this.problemSize === 'small') {
      return (
        result.length === 9 &&
        result.every((r) => r.values.length === 30 || r.values.length === 60)
      );
    }

    if (this.problemSize === 'medium') {
      return (
        result.length === 15 && result.every((r) => r.values.length === 100)
      );
    }

    if (this.problemSize === 'large') {
      return (
        result.length === 32 &&
        result.every((r) => r.values.length === 128 || r.values.length === 100)
      );
    }
    console.log(result, result.length, result[1].values.length);

    return false;
  }
}
