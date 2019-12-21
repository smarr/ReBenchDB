import { performance } from 'perf_hooks';
import { Database } from './db';
import { BenchmarkData, DataPoint, Measure } from './api';

let _data: BenchmarkData;
const measure: Measure = {c: 0, v: 0};
const dataPoint: DataPoint = {
  in: 0,
  it: 0,
  m: [measure]
};

export function initPerfTracker() {
  _data = {
    data: [{
      d: [dataPoint],
      run_id: {
        benchmark: {
          name: 'put-results',
          suite: {
            name: 'ReBenchDB API',
            desc: 'Performance tracking of the ReBenchDB API',
            executor: {
              name: 'Node.js',
              desc: null
            }
          },
          run_details: {
            max_invocation_time: 0, min_iteration_time: 0, warmup: null
          },
          desc: 'Time of PUT /results'
        },
        cmdline: '', location: '', var_value: null, cores: null, input_size: null
      }
    }],
    criteria: [
      {i: 0, c: 'total', u: 'ms'}
    ],
    env: {
      hostName: 'self',
      cpu: '', memory: '', osType: '', userName: '', software: [],
      manualRun: false
    },
    source: {
      repoURL: 'https://github.com/smarr/ReBenchDB',
      branchOrTag: 'master',
      commitId: '',
      commitMsg: '',
      authorEmail: '',
      authorName: '',
      committerEmail: '',
      committerName: ''
    },
    startTime: new Date().toISOString(),
    endTime: null,
    projectName: 'ReBenchDB Self-Tracking'
  };
}

export function startRequest(): number {
  return performance.now();
}

export async function completeRequest(reqStart: number, db: Database) {
  const time = performance.now() - reqStart;
  measure.v = time;
  dataPoint.it += 1;

  await db.recordData(_data);
}
