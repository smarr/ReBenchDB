import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';
import { RebenchDbBenchmark } from './rebenchdb-benchmark.js';
import { renderCompareViewToString } from '../backend/compare/report.js';
import { convertToCurrentApi } from '../backend/common/api-v1.js';

export default class RenderReport extends RebenchDbBenchmark {
  private baseHash: string | null = null;
  private changeHash: string | null = null;
  private tmpDir: string | null = null;

  public async oneTimeSetup(problemSize: string): Promise<void> {
    await super.oneTimeSetup(problemSize);

    if (problemSize === 'full') {
      // use as is
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
    (<any>this).testData = convertToCurrentApi(this.testData);

    this.testData.experimentName = 'Benchmark 1';
    this.baseHash = this.testData.source.commitId = 'commit-1';
    await this.db?.recordAllData(this.testData);

    this.testData.experimentName = 'Benchmark 2';
    this.changeHash = this.testData.source.commitId = 'commit-2';
    await this.db?.recordAllData(this.testData);

    this.tmpDir = mkdtempSync(path.join(tmpdir(), '/rebenchdb-tmp'));
  }

  public async oneTimeTeardown(): Promise<void> {
    super.oneTimeTeardown();
    if (this.tmpDir) {
      rmSync(this.tmpDir, { recursive: true, force: true });
    }
  }

  public async benchmark(): Promise<string> {
    if (!this.baseHash || !this.changeHash || !this.tmpDir || !this.db) {
      throw new Error(
        'RenderReport.oneTimeSetup did not set baseHash or changeHash'
      );
    }

    return await renderCompareViewToString(
      this.baseHash,
      this.changeHash,
      'Large-Example-Project',
      this.db
    );
  }

  public verifyResult(result: any): boolean {
    let r = true;

    for (const run of this.testData.data) {
      r &&= result.includes(run.runId.benchmark.name);
    }

    return r;
  }
}
