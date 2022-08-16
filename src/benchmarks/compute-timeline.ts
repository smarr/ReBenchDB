import { TimelineJob } from '../api.js';
import { RebenchDbBenchmark } from './rebenchdb-benchmark.js';

export default class ComputeTimeline extends RebenchDbBenchmark {
  private jobs: TimelineJob[] = [];

  public async oneTimeSetup(problemSize: string): Promise<void> {
    await super.oneTimeSetup(problemSize);

    if (problemSize === 'full') {
      // just use the testData as is
    } else if (problemSize === 'large') {
      this.testData.data.length = 50;
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

    this.testData.experimentName = 'Benchmark 1';
    this.testData.source.commitId = 'commit-1';
    await this.db?.recordAllData(this.testData);

    this.testData.experimentName = 'Benchmark 2';
    this.testData.source.commitId = 'commit-2';
    await this.db?.recordAllData(this.testData);

    const result = await this.db?.query({
      text: `DELETE FROM TimelineCalcJob RETURNING *`
    });
    this.jobs = <TimelineJob[]>result?.rows;
  }

  public async benchmark(): Promise<any> {
    for (const j of this.jobs) {
      await this.db?.recordTimelineJob([j.trialid, j.runid, j.criterion]);
    }
    await this.db?.performTimelineUpdate();
    const result = await this.db?.query({
      text: `SELECT count(*) FROM Timeline`
    });

    await this.db?.query({ text: `TRUNCATE Timeline, TimelineCalcJob` });

    return {
      timelineEntries: result?.rows[0],
      numJobs: this.jobs.length
    };
  }

  public verifyResult(result: any): boolean {
    if (this.problemSize === 'small') {
      return result.numJobs === 24 && result.timelineEntries.count === '24';
    }

    if (this.problemSize === 'medium') {
      return result.numJobs === 52 && result.timelineEntries.count === '52';
    }

    if (this.problemSize === 'large') {
      return result.numJobs === 152 && result.timelineEntries.count === '152';
    }

    if (this.problemSize === 'full') {
      return result.numJobs === 920 && result.timelineEntries.count === '920';
    }

    throw new Error('not yet supported problem size ' + this.problemSize);
  }
}
