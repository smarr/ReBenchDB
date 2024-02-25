import { performance } from 'perf_hooks';
import { Database } from './db/db.js';
import type { BenchmarkData } from '../shared/api.js';
import { TotalCriterion, isRunningTests } from './util.js';
import type { Run, Trial } from './db/types.js';
import { assert, log } from './logging.js';

// Performance tracking design
// - when ReBenchDB starts up, this marks a new trial with a single invocation
// - at startup, we eagerly create the measurement records
// - and then for the performance tracking, we append to the values array of
//   the specific row

let startTime: string;

interface TrialDetails {
  trial: Trial;
  run: Run;
  criterionId: number;
}

const trialDetails: { [key: string]: TrialDetails } = {};

const descriptions = {
  'get-results': 'Time of GET /rebenchdb/dash/:projectId/results',
  'put-results': 'Time of PUT /rebenchdb/results',
  change: 'Time of GET /compare/:project/:baseline/:change',
  'change-new': 'Time of GET /compare-new/:project/:baseline/:change',
  'generate-report': 'Time of Running R Reporting for /compare/*',
  'generate-timeline': 'Time of Running R stats to generate timeline data',
  'prep-exp-data': 'Prepare experiment data for download',
  'get-exp-data': 'Starting to prepare experiment data',
  'project-benchmarks': 'Time of GET /rebenchdb/dash/:projectId/benchmarks',
  'get-profiles':
    // this url was changed to use the commitId instead of the trialId
    // I'll leave this unchanged here to avoid issues
    // with the performance tracking
    'Time of GET /rebenchdb/dash/:projectId/profiles/:runId/:trialId',
  'get-measurements': 'Time of GET /rebenchdb/dash/:projectId/measurements/...'
};

export async function initPerfTracker(db: Database): Promise<void> {
  startTime = new Date().toISOString();

  const benchmarkNames = Object.keys(descriptions);
  const initializationData = constructInitialization(benchmarkNames);
  const { metadata, runs } = await db.recordMetaDataAndRuns(initializationData);

  const criterion = [...metadata.criteria.values()][0];

  for (const run of runs) {
    trialDetails[run.cmdline] = {
      trial: metadata.trial,
      run,
      criterionId: criterion.id
    };
  }
}

function constructInitialization(benchmarkNames: string[]) {
  const data: BenchmarkData = {
    experimentName: 'monitoring',
    data: [],
    criteria: [{ i: 0, c: TotalCriterion, u: 'ms' }],
    env: {
      hostName: 'self',
      cpu: '',
      memory: 0,
      clockSpeed: 0,
      osType: 'nodejs',
      userName: 'rebench-perf-tracking',
      software: [],
      manualRun: false,
      denoise: {}
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
    startTime,
    endTime: null,
    projectName: 'ReBenchDB Self-Tracking'
  };

  for (const name of benchmarkNames) {
    data.data.push({
      d: [],
      runId: {
        benchmark: {
          name: name,
          suite: {
            name: 'ReBenchDB API',
            desc: 'Performance tracking of the ReBenchDB API',
            executor: {
              name: 'Node.js',
              desc: null
            }
          },
          runDetails: {
            maxInvocationTime: 0,
            minIterationTime: 0,
            warmup: null
          },
          desc: descriptions[name]
        },
        cmdline: name,
        location: '',
        varValue: null,
        cores: null,
        inputSize: null,
        extraArgs: null
      }
    });
  }

  return data;
}

export function startRequest(): number {
  return performance.now();
}

export async function completeRequest(
  reqStart: number,
  db: Database,
  request: string
): Promise<[number, number] | void> {
  if (isRunningTests) {
    return;
  }

  const time = performance.now() - reqStart;

  assert(
    trialDetails[request] !== undefined,
    'Performance tracking not initialized'
  );

  const details = trialDetails[request];

  return db.recordAdditionalMeasurementValue(
    details.run,
    details.trial,
    details.criterionId,
    time
  );
}

export function completeRequestAndHandlePromise(
  reqStart: number,
  db: Database,
  request: string
): void {
  completeRequest(reqStart, db, request).catch((e) => {
    log.error('Error while recording performance data:', e);
  });
}
