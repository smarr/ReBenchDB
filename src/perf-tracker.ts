import { performance } from 'perf_hooks';
import { Database } from './db';
import { BenchmarkData, DataPoint, Measure } from './api';

let startTime: string;
const iterations = {
  'get-results': 0,
  'put-results': 0,
  'change': 0,
  'generate-report': 0
};

const descriptions = {
  'get-results': 'Time of GET /rebenchdb/dash/:projectId/results',
  'put-results': 'Time of PUT /rebenchdb/results',
  'change': 'Time of GET /compare/:project/:baseline/:change',
  'generate-report': 'Time of Running R Reporting for /compare/*'
}

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
    experimentName: 'monitoring',
    data: [{
      d: [dataPoint],
      runId: {
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
          runDetails: {
            maxInvocationTime: 0, minIterationTime: 0, warmup: null
          },
          desc: descriptions[benchmark]
        },
        cmdline: benchmark, location: '', varValue: null, cores: null, inputSize: null, extraArgs: null
      }
    }],
    criteria: [
      { i: 0, c: 'total', u: 'ms' }
    ],
    env: {
      hostName: 'self',
      cpu: '', memory: 0, clockSpeed: 0, osType: '', userName: '', software: [],
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
    startTime: startTime,
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
