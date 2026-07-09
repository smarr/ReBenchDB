import { RebenchDbBenchmark, reduceData } from './rebenchdb-benchmark.js';

export default class StoreResults extends RebenchDbBenchmark {
  private iteration: number;

  constructor() {
    super();
    this.iteration = 0;
  }

  public async oneTimeSetup(problemSize: string): Promise<void> {
    await super.oneTimeSetup(problemSize);

    if (problemSize === 'full') {
      // just use the testData as is
    } else if (problemSize === 'large') {
      this.testData.data = this.testData.data.slice(0, 50);
    } else if (problemSize === 'medium') {
      reduceData(this.testData, 20, 200);
    } else if (problemSize === 'small') {
      reduceData(this.testData, 10, 15);
    } else {
      throw new Error('Unsupported problem size given: ' + problemSize);
    }
  }

  public async benchmark(): Promise<any> {
    this.iteration += 1;
    this.testData.experimentName = 'Benchmark ' + this.iteration;
    this.testData.source.commitId = 'commit-' + this.iteration;
    return this.db?.recordAllData(this.testData);
  }

  public verifyResult(result: any): boolean {
    const [recMs, recPs] = result;

    if (this.problemSize === 'full') {
      return recMs === 460 && recPs === 0;
    } else if (this.problemSize === 'large') {
      return recMs === 76 && recPs === 0;
    } else if (this.problemSize === 'medium') {
      return recMs === 26 && recPs === 0;
    } else if (this.problemSize === 'small') {
      return recMs === 12 && recPs === 0;
    } else {
      throw new Error('Unsupported problem size given: ' + this.problemSize);
    }
  }
}
