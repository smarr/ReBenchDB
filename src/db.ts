import { execFile } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { BenchmarkData, Executor, Suite, Benchmark, RunId, Source, Environment, Criterion, Run } from './api';
import { Pool, PoolConfig, PoolClient, QueryResult } from 'pg';
import { SingleRequestOnly } from './single-requester';
import { startRequest, completeRequest } from './perf-tracker';

function isUniqueViolationError(err) {
  return err.code === '23505';
}

export interface DatabaseConfig {
  user: string;
  password: string;
  host: string;
  database: string;
  port: number;
}

export function loadScheme(): string {
  let schema = `${__dirname}/../src/db/db.sql`;
  if (!existsSync(schema)) {
    schema = `${__dirname}/../../src/db/db.sql`;
  }

  return readFileSync(schema).toString();
}

export class Database {
  public client: Pool | PoolClient;
  private readonly dbConfig: PoolConfig;
  private readonly timelineEnabled: boolean;

  /** Number of bootstrap samples to take for timeline. */
  private readonly numReplicates: number;

  private readonly executors: Map<string, any>;
  private readonly suites: Map<string, any>;
  private readonly benchmarks: Map<string, any>;
  private readonly runs: Map<string, any>;
  private readonly sources: Map<string, any>;
  private readonly envs: Map<string, any>;
  private readonly trials: Map<string, any>;
  private readonly exps: Map<string, any>;
  private readonly criteria: Map<string, any>;
  private readonly projects: Map<string, any>;

  private readonly timelineUpdater: SingleRequestOnly;

  private readonly queries = {
    fetchExecutorByName: 'SELECT * from Executor WHERE name = $1',
    insertExecutor: 'INSERT INTO Executor (name, description) VALUES ($1, $2) RETURNING *',

    fetchSuiteByName: 'SELECT * from Suite WHERE name = $1',
    insertSuite: 'INSERT INTO Suite (name, description) VALUES ($1, $2) RETURNING *',

    fetchBenchmarkByName: 'SELECT * from Benchmark WHERE name = $1',
    insertBenchmark: 'INSERT INTO Benchmark (name, description) VALUES ($1, $2) RETURNING *',

    fetchRunByCmd: 'SELECT * from Run WHERE cmdline = $1',
    insertRun: `INSERT INTO Run (
        cmdline,
        benchmarkId, execId, suiteId,
        location,
        cores, inputSize, varValue, extraArgs,
        maxInvocationTime, minIterationTime, warmup)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,

    fetchSourceByCommitId: 'SELECT * from Source WHERE commitId = $1',
    insertSource: `INSERT INTO Source (
        repoURL, branchOrTag, commitId, commitMessage,
        authorName, authorEmail, committerName, committerEmail)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    fetchEnvByHostName: 'SELECT * from Environment WHERE hostname =  $1',
    insertEnv: `INSERT INTO Environment (hostname, osType, memory, cpu, clockSpeed) VALUES ($1, $2, $3, $4, $5) RETURNING *`,

    fetchTrialByUserEnvStart: 'SELECT * from Trial WHERE username = $1 AND envId = $2 AND startTime = $3',
    insertTrial: `INSERT INTO Trial (manualRun, startTime, expId, username, envId, sourceId)
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,

    fetchProjectByName: 'SELECT * from Project WHERE name = $1',
    fetchProjectById: 'SELECT * from Project WHERE id = $1',
    insertProject: 'INSERT INTO Project (name) VALUES ($1) RETURNING *',

    fetchExpByProjectIdName: 'SELECT * from Experiment WHERE projectId = $1 AND name = $2',
    insertExp: `INSERT INTO Experiment (name, projectId, description)
      VALUES ($1, $2, $3) RETURNING *`,

    insertMeasurement: {
      name: 'insertMeasurement',
      text: `INSERT INTO Measurement
          (runId, trialId, invocation, iteration, criterion, value)
        VALUES ($1, $2, $3, $4, $5, $6)`,
      values: <any[]>[]
    },

    insertMeasurementBatched10: {
      name: 'insertMeasurement10',
      text: `INSERT INTO Measurement
          (runId, trialId, invocation, iteration, criterion, value)
        VALUES
          ($1, $2, $3, $4, $5, $6),
          ($7, $8, $9, $10, $11, $12),
          ($13, $14, $15, $16, $17, $18),
          ($19, $20, $21, $22, $23, $24),
          ($25, $26, $27, $28, $29, $30),
          ($31, $32, $33, $34, $35, $36),
          ($37, $38, $39, $40, $41, $42),
          ($43, $44, $45, $46, $47, $48),
          ($49, $50, $51, $52, $53, $54),
          ($55, $56, $57, $58, $59, $60)`,
      values: <any[]>[]
    },

    insertMeasurementBatchedN: {
      name: 'insertMeasurementN',
      text: `INSERT INTO Measurement
          (runId, trialId, invocation, iteration, criterion, value)
        VALUES
          GENERATED`,
      values: <any[]>[]
    },

    fetchMaxMeasurements: `SELECT
        runId, criterion, invocation as inv, max(iteration) as ite
      FROM Measurement
      WHERE trialId = $1
      GROUP BY runId, criterion, invocation
      ORDER BY runId, inv, ite, criterion`,

    fetchCriterionByNameUnit: 'SELECT * from Criterion WHERE name = $1 AND unit = $2',
    insertCriterion: 'INSERT INTO Criterion (name, unit) VALUES ($1, $2) RETURNING *',
    fetchUnit: 'SELECT * from Unit WHERE name = $1',
    insertUnit: 'INSERT INTO Unit (name) VALUES ($1)'
  };

  private static readonly batchN = 50;

  constructor(config: PoolConfig, numReplicates = 1000, timelineEnabled = false) {
    console.assert(config !== undefined);
    this.dbConfig = config;
    this.numReplicates = numReplicates;
    this.timelineEnabled = timelineEnabled;
    this.client = new Pool(config);
    this.executors = new Map();
    this.suites = new Map();
    this.benchmarks = new Map();
    this.runs = new Map();
    this.sources = new Map();
    this.envs = new Map();
    this.exps = new Map();
    this.trials = new Map();
    this.criteria = new Map();
    this.projects = new Map();

    this.queries.insertMeasurementBatchedN.text =
      `INSERT INTO Measurement
         (runId, trialId, invocation, iteration, criterion, value)
       VALUES ` + this.generateBatchInsert(Database.batchN, 6);

    this.timelineUpdater = new SingleRequestOnly(async () => { return this.performTimelineUpdate(); });
  }

  private generateBatchInsert(numTuples: number, sizeTuples: number) {
    const nums: string[] = [];
    for (let i = 0; i < numTuples; i += 1) {
      const tupleNums: number[] = [];
      for (let j = 1; j <= sizeTuples; j += 1) {
        tupleNums.push(i * sizeTuples + j);
      }
      nums.push('($' + tupleNums.join(', $') + ')');
    }
    return nums.join(',\n');
  }

  public clearCache(): void {
    this.executors.clear();
    this.suites.clear();
    this.benchmarks.clear();
    this.runs.clear();
    this.sources.clear();
    this.envs.clear();
    this.exps.clear();
    this.trials.clear();
    this.criteria.clear();
    this.projects.clear();
  }

  private async needsTables() {
    const result = await this.client.query(`SELECT *
      FROM   information_schema.tables
      WHERE  table_name = 'executor'`);
    return result.rowCount <= 0;
  }

  public async initializeDatabase(): Promise<void> {
    if (await this.needsTables()) {
      const schema = loadScheme();
      await this.client.query(schema);
    }
  }

  public async activateTransactionSupport(): Promise<void> {
    this.client = <PoolClient> await this.client.connect();
  }

  private async recordCached(cache, cacheKey, fetchQ, qVals, insertQ, insertVals) {
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey);
    }

    let result = await this.client.query(fetchQ, qVals);
    if (result.rowCount === 0) {
      result = await this.client.query(insertQ, insertVals);
    }

    console.assert(result.rowCount === 1);
    cache.set(cacheKey, result.rows[0]);
    return result.rows[0];
  }

  private async recordNameDesc(item, cache, fetchQ, insertQ) {
    return this.recordCached(cache, item.name, fetchQ, [item.name], insertQ, [item.name, item.desc]);
  }

  public async recordExecutor(e: Executor): Promise<any> {
    return this.recordNameDesc(e, this.executors,
      this.queries.fetchExecutorByName, this.queries.insertExecutor);
  }

  public async recordSuite(s: Suite): Promise<any> {
    return this.recordNameDesc(s, this.suites,
      this.queries.fetchSuiteByName, this.queries.insertSuite);
  }

  public async recordBenchmark(b: Benchmark): Promise<any> {
    return this.recordNameDesc(b, this.benchmarks,
      this.queries.fetchBenchmarkByName, this.queries.insertBenchmark);
  }

  public async recordRun(run: RunId): Promise<any> {
    if (this.runs.has(run.cmdline)) {
      return this.runs.get(run.cmdline);
    }

    const exec = await this.recordExecutor(run.benchmark.suite.executor);
    const suite = await this.recordSuite(run.benchmark.suite);
    const benchmark = await this.recordBenchmark(run.benchmark);

    return this.recordCached(this.runs, run.cmdline,
      this.queries.fetchRunByCmd, [run.cmdline],
      this.queries.insertRun, [run.cmdline, benchmark.id, exec.id, suite.id, run.location,
      run.cores, run.inputSize, run.varValue, run.extraArgs,
      run.benchmark.runDetails.maxInvocationTime,
      run.benchmark.runDetails.minIterationTime,
      run.benchmark.runDetails.warmup]);
  }

  public async recordSource(s: Source): Promise<any> {
    return this.recordCached(this.sources, s.commitId,
      this.queries.fetchSourceByCommitId, [s.commitId],
      this.queries.insertSource,
      [s.repoURL, s.branchOrTag, s.commitId, s.commitMsg,
      s.authorName, s.authorEmail, s.committerName, s.committerEmail]);
  }

  public async recordEnvironment(e: Environment): Promise<any> {
    return this.recordCached(this.envs, e.hostName,
      this.queries.fetchEnvByHostName, [e.hostName],
      this.queries.insertEnv, [
      e.hostName, e.osType, e.memory, e.cpu, e.clockSpeed]);
  }

  public async recordTrial(data: BenchmarkData, env: any, exp: any): Promise<any> {
    const e = data.env;
    const cacheKey = `${e.userName}-${env.id}-${data.startTime}`;

    if (this.trials.has(cacheKey)) {
      return this.trials.get(cacheKey);
    }

    const source = await this.recordSource(data.source);

    return this.recordCached(this.trials, cacheKey,
      this.queries.fetchTrialByUserEnvStart,
      [e.userName, env.id, data.startTime],
      this.queries.insertTrial,
      [e.manualRun, data.startTime, exp.id, e.userName, env.id, source.id]);
  }

  public async recordProject(projectName): Promise<any> {
    return this.recordCached(this.projects, projectName,
      this.queries.fetchProjectByName, [projectName],
      this.queries.insertProject, [projectName]);
  }

  public async getProject(projectId): Promise<any> {
    const result = await this.client.query(this.queries.fetchProjectById, [projectId]);

    if (result.rowCount !== 1) {
      return undefined;
    } else {
      return result.rows[0];
    }
  }

  public async recordExperiment(data: BenchmarkData): Promise<any> {
    const cacheKey = `${data.projectName}::${data.experimentName}`;

    if (this.exps.has(cacheKey)) {
      return this.exps.get(cacheKey);
    }

    const project = await this.recordProject(data.projectName);

    return this.recordCached(this.exps, cacheKey,
      this.queries.fetchExpByProjectIdName, [project.id, data.experimentName],
      this.queries.insertExp, [data.experimentName, project.id, data.experimentDesc]);
  }

  private async recordUnit(unitName: string) {
    const result = await this.client.query(this.queries.fetchUnit, [unitName]);
    if (result.rowCount === 0) {
      await this.client.query(this.queries.insertUnit, [unitName]);
    }
  }

  public async recordCriterion(c: Criterion): Promise<any> {
    const cacheKey = `${c.c}::${c.u}`;

    if (this.criteria.has(cacheKey)) {
      return this.criteria.get(cacheKey);
    }

    await this.recordUnit(c.u);
    return this.recordCached(this.criteria, cacheKey,
      this.queries.fetchCriterionByNameUnit, [c.c, c.u],
      this.queries.insertCriterion, [c.c, c.u]);
  }

  private async resolveCriteria(data: Criterion[]) {
    const criteria = new Map();
    for (const c of data) {
      criteria.set(c.i, await this.recordCriterion(c));
    }
    return criteria;
  }

  private async retrieveAvailableMeasurements(trialId) {
    const results = await this.client.query(this.queries.fetchMaxMeasurements, [trialId]);
    const measurements = {};
    for (const r of results.rows) {
      // runid, criterion, inv, ite
      if (!(r.runid in measurements)) {
        measurements[r.runid] = {};
      }

      const run = measurements[r.runid];

      if (!(r.criterion in run)) {
        run[r.criterion] = {};
      }

      const crit = run[r.criterion];

      console.assert(!(r.inv in crit), `${r.runid}, ${r.criterion}, ${r.inv} in ${JSON.stringify(crit)}`);
      crit[r.inv] = r.ite;
    }

    return measurements;
  }

  private alreadyRecorded(measurements, [runId, _expId, inv, ite, critId, _val]: any[]) {
    if (runId in measurements) {
      const run = measurements[runId];
      if (critId in run) {
        const crit = run[critId];
        if (inv in crit) {
          return crit[inv] >= ite;
        }
      }
    }

    return false;
  }

  private async recordMeasurementsFromBatch(batchedValues: any[]) {
    let recordedMeasurements = 0;

    while (batchedValues.length > 0) {
      const rest = batchedValues.splice(6 * 1); // there are 6 parameters, i.e., values
      try {
        await this.recordMeasurement(batchedValues);
        recordedMeasurements += 1;
      } catch (err) {
        // looks like we already have this data
        if (!isUniqueViolationError(err)) {
          throw err;
        }
      }
      batchedValues = rest;
    }

    return recordedMeasurements;
  }

  public async recordMeasurements(r: Run, run: any, trial: any, criteria: Map<any, any>, availableMs: any): Promise<number> {
    let recordedMeasurements = 0;
    let batchedMs = 0;
    let batchedValues: any[] = [];

    for (const d of r.d) {
      for (const m of d.m) {
        // batched inserts are much faster
        // so let's do this
        const values = [run.id, trial.id, d.in, d.it, criteria.get(m.c).id, m.v];
        if (this.alreadyRecorded(availableMs, values)) {
          // then,just skip this one.
          continue;
        }
        batchedMs += 1;
        batchedValues = batchedValues.concat(values);
        if (batchedMs === Database.batchN) {
          try {
            await this.recordMeasurementBatchedN(batchedValues);
            recordedMeasurements += batchedMs;
          } catch (err) {
            // we may have concurrent inserts, or partially inserted data, where a request aborted
            if (isUniqueViolationError(err)) {
              recordedMeasurements += await this.recordMeasurementsFromBatch(batchedValues);
            } else {
              throw err;
            }
          }
          batchedValues = [];
          batchedMs = 0;
        }
      }
    }

    while (batchedValues.length >= 6 * 10) {
      const rest = batchedValues.splice(6 * 10); // there are 6 parameters, i.e., values
      try {
        await this.recordMeasurementBatched10(batchedValues);
        recordedMeasurements += 10;
      } catch (err) {
        if (isUniqueViolationError(err)) {
          recordedMeasurements += await this.recordMeasurementsFromBatch(batchedValues);
        }
      }
      batchedValues = rest;
    }

    recordedMeasurements += await this.recordMeasurementsFromBatch(batchedValues);
    return recordedMeasurements;
  }

  public async recordMetaData(data: BenchmarkData): Promise<{ env, exp, trial, criteria }> {
    const env = await this.recordEnvironment(data.env);
    const exp = await this.recordExperiment(data);
    const trial = await this.recordTrial(data, env, exp);

    const criteria = await this.resolveCriteria(data.criteria);

    return { env, exp, trial, criteria };
  }

  public async recordAllData(data: BenchmarkData, suppressTimeline = false): Promise<number> {
    const { trial, criteria } = await this.recordMetaData(data);

    let recordedMeasurements = 0;

    for (const r of data.data) {
      const run = await this.recordRun(r.runId);
      const availableMs = await this.retrieveAvailableMeasurements(trial.id);
      recordedMeasurements += await this.recordMeasurements(r, run, trial, criteria, availableMs);
    }

    if (recordedMeasurements > 0 && this.timelineEnabled && !suppressTimeline) {
      this.generateTimeline();
    }

    return recordedMeasurements;
  }

  public async recordMetaDataAndRuns(data: BenchmarkData): Promise<number> {
    await this.recordMetaData(data);

    for (const r of data.data) {
      await this.recordRun(r.runId);
    }

    return data.data.length;
  }

  public async recordMeasurementBatched10(values: any[]): Promise<QueryResult<any>> {
    const q = this.queries.insertMeasurementBatched10;
    q.values = values; // [runId, trialId, invocation, iteration, critId, value];
    return await this.client.query(q);
  }

  public async recordMeasurementBatchedN(values: any[]): Promise<QueryResult<any>> {
    const q = this.queries.insertMeasurementBatchedN;
    q.values = values; // [runId, trialId, invocation, iteration, critId, value];
    return await this.client.query(q);
  }

  public async recordMeasurement(values: any[]): Promise<QueryResult<any>> {
    const q = this.queries.insertMeasurement;
    q.values = values; // [runId, trialId, invocation, iteration, critId, value];
    // console.log('rec Measure');
    // console.log(q);
    return await this.client.query(this.queries.insertMeasurement);
  }

  private generateTimeline() {
    this.timelineUpdater.trigger();
  }

  public async awaitQuiescentTimelineUpdater(): Promise<void> {
    await this.timelineUpdater.getQuiescencePromise();
  }

  public performTimelineUpdate(): Promise<any> {
    const prom = new Promise((resolve, reject) => {
      let timelineR = `${__dirname}/stats/timeline.R`;
      let workDir = `${__dirname}/stats/`;
      if (!existsSync(timelineR)) {
        timelineR = `${__dirname}/../../src/stats/timeline.R`;
        workDir = `${__dirname}/../../src/stats/`;
      }

      const dbArgs = <string[]>[
        this.dbConfig.database, this.dbConfig.user, this.dbConfig.password,
        this.numReplicates];
      const start = startRequest();
      execFile(timelineR, dbArgs, { cwd: workDir },
        async (errorCode, stdout, stderr) => {
          function handleResult() {
            if (errorCode) {
              console.log(`timeline.R failed: ${errorCode}
              Stdout:
                ${stdout}

              Stderr:
                ${stderr}`);
              reject(errorCode);
            } else {
              resolve(errorCode);
            }
          }
          completeRequest(start, this, 'generate-timeline')
            .then(handleResult)
            .catch(handleResult);
        });
    });
    return prom;
  }
}


