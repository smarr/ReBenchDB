import { dashResults } from '../dashboard.js';
import { RebenchDbBenchmark } from './rebenchdb-benchmark.js';

export default class RenderReport extends RebenchDbBenchmark {
  public async oneTimeSetup(problemSize: string): Promise<void> {
    await super.oneTimeSetup(problemSize);

    this.testData.experimentName = 'Benchmark 1';
    this.testData.source.commitId = 'commit-1';
    await this.db?.recordAllData(this.testData);

    this.testData.experimentName = 'Benchmark 2';
    this.testData.source.commitId = 'commit-2';
    await this.db?.recordAllData(this.testData);
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
