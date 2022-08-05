import { RebenchDbBenchmark } from './rebenchdb-benchmark.js';

export default class StoreResults extends RebenchDbBenchmark {
  private iteration: number;

  constructor() {
    super();
    this.iteration = 0;
  }

  public async benchmark(): Promise<any> {
    this.iteration += 1;
    this.testData.experimentName = 'Benchmark ' + this.iteration;
    this.testData.source.commitId = 'commit-' + this.iteration;
    return this.db?.recordAllData(this.testData);
  }

  public verifyResult(result: any): boolean {
    const [recMs, recPs] = result;

    if (this.problemSize === 'large') {
      return recMs === 459928 && recPs === 0;
    } else if (this.problemSize === 'medium') {
      return recMs === 5197 && recPs === 0;
    } else if (this.problemSize === 'small') {
      return recMs === 179 && recPs === 0;
    } else {
      throw new Error('Unsupported problem size given: ' + this.problemSize);
    }
  }
}
