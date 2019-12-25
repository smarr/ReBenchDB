import { performance } from 'perf_hooks';
import { Database } from './db';
import { BenchmarkData, DataPoint, Measure } from './api';

let startTime: string;
const iterations = {
  'put-results': 0,
  'change': 0,
  'generate-report': 0
};

export function initPerfTracker() {
  startTime = new Date().toISOString();
}

function constructData(time: number, it: number, benchmark: string) {
  const measure: Measure = { c: 0, v: time };
  const dataPoint: DataPoint = {
    in: 0,
    it: it,
    m: [measure]
  };

  const data: BenchmarkData = {
    data: [{
      d: [dataPoint],
      run_id: {
        benchmark: {
          name: benchmark,
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
        cmdline: '', location: '', var_value: null, cores: null, input_size: null, extra_args: null
      }
    }],
    criteria: [
      { i: 0, c: 'total', u: 'ms' }
    ],
    env: {
      hostName: 'self',
      cpu: '', memory: 0, osType: '', userName: '', software: [],
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

  return data;
}

export function startRequest(): number {
  return performance.now();
}

export async function completeRequest(reqStart: number, db: Database, request: string) {
  const time = performance.now() - reqStart;
  iterations[request] += 1;
  await db.recordData(constructData(time, iterations[request], request));
}
