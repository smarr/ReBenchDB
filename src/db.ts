import { execFile } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import {
  BenchmarkData,
  Executor as ApiExecutor,
  Suite as ApiSuite,
  Benchmark as ApiBenchmark,
  RunId as ApiRunId,
  Source as ApiSource,
  Environment as ApiEnvironment,
  Criterion as ApiCriterion,
  DataPoint as ApiDataPoint,
  ProfileData as ApiProfileData,
  BenchmarkCompletion
} from './api';
import pg, { PoolConfig, QueryConfig, QueryResultRow } from 'pg';
import { SingleRequestOnly } from './single-requester.js';
import { startRequest, completeRequest } from './perf-tracker.js';
import { getDirname } from './util.js';

const __dirname = getDirname(import.meta.url);

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

export interface Executor {
  id: number;
  name: string;
  description: string;
}

export interface Suite {
  id: number;
  name: string;
  description: string;
}

export interface Benchmark {
  id: number;
  name: string;
  description: string;
}

export interface SoftwareVersionInfo {
  id: number;
  name: string;
  version: string;
}

export interface Environment {
  id: number;
  hostname: string;
  ostype: string;
  memory: number;
  cpu: string;
  clockspeed: number;
  note: string;
}

export interface Unit {
  name: string;
  description: string;
  lessisbetter: boolean;
}

export interface Criterion {
  id: number;
  name: string;
  unit: string;
}

export interface Project {
  id: number;
  name: string;
  description: string;
  logo: string;
  showchanges: boolean;
  allresults: boolean;
  basebranch: string;
}

export interface Source {
  id: number;
  repourl: string;
  branchortag: string;
  commitid: string;
  commitmessage: string;
  authorname: string;
  authoremail: string;
  committereame: string;
  committeremail: string;
}

export interface Experiment {
  id: number;

  name: string;
  projectid: number;

  description: string;
}

export interface Trial {
  id: number;
  manualrun: boolean;
  starttime: string;

  expid: number;

  username: string;
  envid: number;
  sourceid: number;

  denoise: string;
  endTime: string;
}

export interface SoftwareUse {
  envid: string;
  softid: string;
}

export interface Run {
  id: number;
  benchmarkid: number;
  suiteid: number;
  execid: number;
  cmdline: string;
  location: string;
  varvalue: string;
  cores: string;
  inputsize: string;
  extraargs: string;
  maxinvocationtime: number;
  miniterationtime: number;
  warmup: number;
}

export interface Measurement {
  runid: number;
  trialid: number;
  criterion: number;
  invocation: number;
  iteration: number;

  value: number;
}

export interface Baseline extends Source {
  firststart: string;
}

function filterCommitMessage(msg) {
  return msg
    .replaceAll('\\n', '\n') // resolve new lines
    .replace(/Signed-off-by:.*/g, '') // remove signed-off-by lines
    .trim();
}

export abstract class Database {
  protected readonly dbConfig: PoolConfig;
  private readonly timelineEnabled: boolean;

  /** Number of bootstrap samples to take for timeline. */
  private readonly numReplicates: number;

  private readonly executors: Map<string, Executor>;
  private readonly suites: Map<string, Suite>;
  private readonly benchmarks: Map<string, Benchmark>;
  private readonly runs: Map<string, Run>;
  private readonly sources: Map<string, Source>;
  private readonly envs: Map<string, Environment>;
  private readonly trials: Map<string, Trial>;
  private readonly exps: Map<string, Experiment>;
  private readonly criteria: Map<string, Criterion>;
  private readonly projects: Map<string, Project>;

  private readonly timelineUpdater: SingleRequestOnly;

  private readonly queries = {
    fetchExecutorByName: 'SELECT * from Executor WHERE name = $1',
    insertExecutor: `INSERT INTO Executor (name, description)
                     VALUES ($1, $2) RETURNING *`,

    fetchSuiteByName: 'SELECT * from Suite WHERE name = $1',
    insertSuite: `INSERT INTO Suite (name, description)
                  VALUES ($1, $2) RETURNING *`,

    fetchBenchmarkByName: 'SELECT * from Benchmark WHERE name = $1',
    insertBenchmark: `INSERT INTO Benchmark (name, description)
                      VALUES ($1, $2) RETURNING *`,

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
    insertEnv: `INSERT INTO Environment (
                  hostname, osType, memory, cpu, clockSpeed)
                VALUES ($1, $2, $3, $4, $5) RETURNING *`,

    fetchTrialByUserEnvStart: `SELECT * FROM Trial
                               WHERE username = $1 AND envId = $2 AND
                                     startTime = $3`,
    insertTrial: `INSERT INTO Trial (manualRun, startTime, expId, username,
                                     envId, sourceId, denoise)
                  VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    updateTrialEndTime: `UPDATE Trial t
                         SET endTime = $2
                         WHERE expId = $1 AND endTime IS NULL`,

    fetchProjectByName: 'SELECT * from Project WHERE name = $1',
    fetchProjectBySlugName: `SELECT * from Project
                               WHERE lower($1) = regexp_replace(
                                    lower(name), '\\s', '-', 'g')`,
    fetchProjectById: 'SELECT * from Project WHERE id = $1',
    insertProject: 'INSERT INTO Project (name) VALUES ($1) RETURNING *',

    fetchExpByNames: `SELECT e.* FROM Experiment e
                        JOIN Project p ON p.id = e.projectId
                        WHERE p.name = $1 AND e.name = $2`,
    fetchExpByProjectIdName: `SELECT * FROM Experiment
                              WHERE projectId = $1 AND name = $2`,
    insertExp: `INSERT INTO Experiment (name, projectId, description)
                VALUES ($1, $2, $3) RETURNING *`,

    insertMeasurement: {
      name: 'insertMeasurement',
      text: `INSERT INTO Measurement
          (runId, trialId, invocation, iteration, criterion, value)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT DO NOTHING`,
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
          ($55, $56, $57, $58, $59, $60)
          ON CONFLICT DO NOTHING`,
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

    insertProfile: {
      name: 'insertProfile',
      text: `INSERT INTO ProfileData
          (runId, trialId, invocation, numIterations, value)
        VALUES
          ($1, $2, $3, $4, $5)
        ON CONFLICT DO NOTHING`,
      values: <any[]>[]
    },

    fetchMaxMeasurements: `SELECT
        runId, criterion, invocation as inv, max(iteration) as ite
      FROM Measurement
      WHERE trialId = $1
      GROUP BY runId, criterion, invocation
      ORDER BY runId, inv, ite, criterion`,

    insertTimelineJob: `INSERT INTO TimelineCalcJob
                          (trialId, runId, criterion)
                        VALUES ($1, $2, $3)`,

    fetchCriterionByNameUnit: `SELECT * FROM Criterion
                               WHERE name = $1 AND unit = $2`,
    insertCriterion: `INSERT INTO Criterion (name, unit)
                      VALUES ($1, $2) RETURNING *`,
    fetchUnit: 'SELECT * from Unit WHERE name = $1',
    insertUnit: 'INSERT INTO Unit (name) VALUES ($1)',

    fetchRevsInProject: `SELECT DISTINCT
                           p.id, e.name, s.id,
                           s.commitid, s.repoUrl, s.branchOrTag,
                           s.commitMessage, s.authorName
                         FROM Project p
                            JOIN Experiment e ON e.projectId = p.id
                            JOIN Trial t ON e.id = t.expId
                            JOIN Source s ON t.sourceId = s.id
                          WHERE p.name = $1
                            AND s.commitid = $2
                            OR s.commitid = $3`
  };

  private static readonly batchN = 50;

  constructor(
    config: PoolConfig,
    numReplicates = 1000,
    timelineEnabled = false
  ) {
    console.assert(config !== undefined);
    this.dbConfig = config;
    this.numReplicates = numReplicates;
    this.timelineEnabled = timelineEnabled;
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

    this.queries.insertMeasurementBatchedN.text = `INSERT INTO Measurement
         (runId, trialId, invocation, iteration, criterion, value)
       VALUES ${this.generateBatchInsert(Database.batchN, 6)}
       ON CONFLICT DO NOTHING`;

    this.timelineUpdater = new SingleRequestOnly(async () => {
      return this.performTimelineUpdate();
    });
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

  public abstract query<
    R extends pg.QueryResultRow = any,
    I extends any[] = any[]
  >(
    queryTextOrConfig: string | pg.QueryConfig<I>,
    values?: I
  ): Promise<pg.QueryResult<R>>;

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
    const result = await this.query(`SELECT *
      FROM   information_schema.tables
      WHERE  table_name = 'executor'`);
    return result.rowCount <= 0;
  }

  public async initializeDatabase(): Promise<void> {
    if (await this.needsTables()) {
      const schema = loadScheme();
      await this.query(schema);
    }
  }

  public abstract close(): Promise<void>;

  public async revisionsExistInProject(
    project: string,
    base: string,
    change: string
  ): Promise<any> {
    const result = await this.query(this.queries.fetchRevsInProject, [
      project,
      base,
      change
    ]);

    // we can have multiple experiments with the same revisions
    if (result.rowCount >= 2) {
      let baseData;
      let changeData;
      for (const row of result.rows) {
        if (row.commitid === base) {
          baseData = row;
        } else if (row.commitid === change) {
          changeData = row;
        }
      }

      baseData.commitmessage = filterCommitMessage(baseData.commitmessage);
      changeData.commitmessage = filterCommitMessage(changeData.commitmessage);

      return {
        dataFound: true,
        base: baseData,
        change: changeData
      };
    } else {
      return { dataFound: false };
    }
  }

  private async recordCached(
    cache,
    cacheKey,
    fetchQ,
    qVals,
    insertQ,
    insertVals
  ) {
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey);
    }

    let result = await this.query(fetchQ, qVals);
    if (result.rowCount === 0) {
      result = await this.query(insertQ, insertVals);
    }

    console.assert(result.rowCount === 1);
    cache.set(cacheKey, result.rows[0]);
    return result.rows[0];
  }

  private async recordNameDesc(item, cache, fetchQ, insertQ) {
    return this.recordCached(cache, item.name, fetchQ, [item.name], insertQ, [
      item.name,
      item.desc
    ]);
  }

  public async recordExecutor(e: ApiExecutor): Promise<Executor> {
    return this.recordNameDesc(
      e,
      this.executors,
      this.queries.fetchExecutorByName,
      this.queries.insertExecutor
    );
  }

  public async recordSuite(s: ApiSuite): Promise<Suite> {
    return this.recordNameDesc(
      s,
      this.suites,
      this.queries.fetchSuiteByName,
      this.queries.insertSuite
    );
  }

  public async recordBenchmark(b: ApiBenchmark): Promise<Benchmark> {
    return this.recordNameDesc(
      b,
      this.benchmarks,
      this.queries.fetchBenchmarkByName,
      this.queries.insertBenchmark
    );
  }

  public async recordRun(run: ApiRunId): Promise<Run> {
    if (this.runs.has(run.cmdline)) {
      return <Run>this.runs.get(run.cmdline);
    }

    const exec = await this.recordExecutor(run.benchmark.suite.executor);
    const suite = await this.recordSuite(run.benchmark.suite);
    const benchmark = await this.recordBenchmark(run.benchmark);

    return this.recordCached(
      this.runs,
      run.cmdline,
      this.queries.fetchRunByCmd,
      [run.cmdline],
      this.queries.insertRun,
      [
        run.cmdline,
        benchmark.id,
        exec.id,
        suite.id,
        run.location,
        run.cores,
        run.inputSize,
        run.varValue,
        run.extraArgs,
        run.benchmark.runDetails.maxInvocationTime,
        run.benchmark.runDetails.minIterationTime,
        run.benchmark.runDetails.warmup
      ]
    );
  }

  public async recordSource(s: ApiSource): Promise<Source> {
    return this.recordCached(
      this.sources,
      s.commitId,
      this.queries.fetchSourceByCommitId,
      [s.commitId],
      this.queries.insertSource,
      [
        s.repoURL,
        s.branchOrTag,
        s.commitId,
        s.commitMsg,
        s.authorName,
        s.authorEmail,
        s.committerName,
        s.committerEmail
      ]
    );
  }

  public async recordEnvironment(e: ApiEnvironment): Promise<Environment> {
    return this.recordCached(
      this.envs,
      e.hostName,
      this.queries.fetchEnvByHostName,
      [e.hostName],
      this.queries.insertEnv,
      [e.hostName, e.osType, e.memory, e.cpu, e.clockSpeed]
    );
  }

  public async recordTrial(
    data: BenchmarkData,
    env: Environment,
    exp: Experiment
  ): Promise<Trial> {
    const e = data.env;
    const cacheKey = `${e.userName}-${env.id}-${data.startTime}`;

    if (this.trials.has(cacheKey)) {
      return <Trial>this.trials.get(cacheKey);
    }

    const source = await this.recordSource(data.source);

    return this.recordCached(
      this.trials,
      cacheKey,
      this.queries.fetchTrialByUserEnvStart,
      [e.userName, env.id, data.startTime],
      this.queries.insertTrial,
      [
        e.manualRun,
        data.startTime,
        exp.id,
        e.userName,
        env.id,
        source.id,
        e.denoise
      ]
    );
  }

  public async recordProject(projectName: string): Promise<Project> {
    return this.recordCached(
      this.projects,
      projectName,
      this.queries.fetchProjectByName,
      [projectName],
      this.queries.insertProject,
      [projectName]
    );
  }

  public async getProjectBySlug(
    projectNameSlug: string
  ): Promise<Project | undefined> {
    const result = await this.query(this.queries.fetchProjectBySlugName, [
      projectNameSlug
    ]);

    if (result.rowCount !== 1) {
      return undefined;
    }
    return result.rows[0];
  }

  public async getProject(projectId: number): Promise<Project | undefined> {
    const result = await this.query(this.queries.fetchProjectById, [projectId]);

    if (result.rowCount !== 1) {
      return undefined;
    } else {
      return result.rows[0];
    }
  }

  public async setProjectBaseBranch(
    projectName: string,
    baseBranch: string
  ): Promise<boolean> {
    const result = await this.query(
      `
      UPDATE Project
        SET baseBranch = $2
        WHERE name = $1`,
      [projectName, baseBranch]
    );
    return result.rowCount === 1;
  }

  public async getBaselineCommit(
    projectName: string,
    currentCommitId: string
  ): Promise<Baseline | undefined> {
    const result = await this.query(
      `
      SELECT DISTINCT s.*, min(t.startTime) as firstStart
        FROM Source s
          JOIN Trial t ON s.id = t.sourceId
          JOIN Experiment e ON e.id = t.expId
          JOIN Project p ON p.id = e.projectId
        WHERE p.name = $1 AND
          s.branchOrTag = p.baseBranch AND
          s.commitId <> $2 AND
          p.baseBranch IS NOT NULL
        GROUP BY e.id, s.id
        ORDER BY firstStart DESC
        LIMIT 1`,
      [projectName, currentCommitId]
    );

    if (result.rowCount < 1) {
      return undefined;
    } else {
      return result.rows[0];
    }
  }

  public async getSourceByNames(
    projectName: string,
    experimentName: string
  ): Promise<Source | undefined> {
    const result = await this.query(
      `
      SELECT DISTINCT s.*
        FROM Source s
          JOIN Trial t ON s.id = t.sourceId
          JOIN Experiment e ON e.id = t.expId
          JOIN Project p ON p.id = e.projectId
        WHERE p.name = $1 AND e.name = $2`,
      [projectName, experimentName]
    );

    if (result.rowCount < 1) {
      return undefined;
    } else {
      return result.rows[0];
    }
  }

  public async recordExperiment(data: BenchmarkData): Promise<Experiment> {
    const cacheKey = `${data.projectName}::${data.experimentName}`;

    if (this.exps.has(cacheKey)) {
      return <Experiment>this.exps.get(cacheKey);
    }

    const project = await this.recordProject(data.projectName);

    return this.recordCached(
      this.exps,
      cacheKey,
      this.queries.fetchExpByProjectIdName,
      [project.id, data.experimentName],
      this.queries.insertExp,
      [data.experimentName, project.id, data.experimentDesc]
    );
  }

  public async getExperimentByNames(
    projectName: string,
    experimentName: string
  ): Promise<Experiment | undefined> {
    const cacheKey = `${projectName}::${experimentName}`;
    if (this.exps.has(cacheKey)) {
      return this.exps.get(cacheKey);
    }

    const result = await this.query(this.queries.fetchExpByNames, [
      projectName,
      experimentName
    ]);
    if (result.rowCount < 1) {
      return undefined;
    }
    return result.rows[0];
  }

  public async recordExperimentCompletion(
    expId: number,
    endTime: string
  ): Promise<void> {
    await this.query(this.queries.updateTrialEndTime, [expId, endTime]);
  }

  public async reportCompletion(
    data: BenchmarkCompletion
  ): Promise<Experiment> {
    const exp = await this.getExperimentByNames(
      data.projectName,
      data.experimentName
    );
    if (exp === undefined) {
      throw new Error(
        `Could not record completion, no experiment found for ` +
          `${data.projectName} ${data.experimentName}`
      );
    }

    if (!data.endTime) {
      throw new Error(`Could not record completion without endTime`);
    }

    await this.recordExperimentCompletion(exp.id, data.endTime);
    return exp;
  }

  private async recordUnit(unitName: string) {
    const result = await this.query(this.queries.fetchUnit, [unitName]);
    if (result.rowCount === 0) {
      await this.query(this.queries.insertUnit, [unitName]);
    }
  }

  public async recordCriterion(c: ApiCriterion): Promise<Criterion> {
    const cacheKey = `${c.c}::${c.u}`;

    if (this.criteria.has(cacheKey)) {
      return <Criterion>this.criteria.get(cacheKey);
    }

    await this.recordUnit(c.u);
    return this.recordCached(
      this.criteria,
      cacheKey,
      this.queries.fetchCriterionByNameUnit,
      [c.c, c.u],
      this.queries.insertCriterion,
      [c.c, c.u]
    );
  }

  private async resolveCriteria(
    data: ApiCriterion[]
  ): Promise<Map<number, Criterion>> {
    const criteria: Map<number, Criterion> = new Map();
    for (const c of data) {
      criteria.set(c.i, await this.recordCriterion(c));
    }
    return criteria;
  }

  private async retrieveAvailableMeasurements(trialId: number) {
    const results = await this.query(this.queries.fetchMaxMeasurements, [
      trialId
    ]);
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

      console.assert(
        !(r.inv in crit),
        `${r.runid}, ${r.criterion}, ${r.inv} in ${JSON.stringify(crit)}`
      );
      crit[r.inv] = r.ite;
    }

    return measurements;
  }

  private alreadyRecorded(
    measurements,
    [runId, _expId, inv, ite, critId, _val]: any[]
  ) {
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
      // there are 6 parameters, i.e., values
      const rest = batchedValues.splice(6 * 1);
      try {
        const result = await this.recordMeasurement(batchedValues);
        recordedMeasurements += result;
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

  public async recordProfiles(
    profiles: ApiProfileData[],
    run: any,
    trial: any
  ): Promise<number> {
    let recordedProfiles = 0;

    for (const p of profiles) {
      let data = p.d;
      if (typeof data !== 'string') {
        data = JSON.stringify(p.d);
      }
      recordedProfiles += await this.recordProfile(
        run.id,
        trial.id,
        p.in,
        p.nit,
        data
      );
    }

    return recordedProfiles;
  }

  public async recordMeasurements(
    dataPoints: ApiDataPoint[],
    run: any,
    trial: any,
    criteria: Map<any, any>,
    availableMs: any
  ): Promise<number> {
    let recordedMeasurements = 0;
    let batchedMs = 0;
    let batchedValues: any[] = [];
    const updateJobs = new TimelineUpdates(this);

    for (const d of dataPoints) {
      for (const m of d.m) {
        // batched inserts are much faster
        // so let's do this
        const values = [
          run.id,
          trial.id,
          d.in,
          d.it,
          criteria.get(m.c).id,
          m.v
        ];
        if (this.alreadyRecorded(availableMs, values)) {
          // then,just skip this one.
          continue;
        }

        updateJobs.recorded(values[1], values[0], values[4]);
        batchedMs += 1;
        batchedValues = batchedValues.concat(values);
        if (batchedMs === Database.batchN) {
          try {
            const result = await this.recordMeasurementBatchedN(batchedValues);
            recordedMeasurements += result;
          } catch (err) {
            // we may have concurrent inserts, or partially inserted data,
            // where a request aborted
            if (isUniqueViolationError(err)) {
              recordedMeasurements += await this.recordMeasurementsFromBatch(
                batchedValues
              );
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
      // there are 6 parameters, i.e., values
      const rest = batchedValues.splice(6 * 10);
      try {
        const result = await this.recordMeasurementBatched10(batchedValues);
        recordedMeasurements += result;
      } catch (err) {
        if (isUniqueViolationError(err)) {
          recordedMeasurements += await this.recordMeasurementsFromBatch(
            batchedValues
          );
        }
      }
      batchedValues = rest;
    }

    recordedMeasurements += await this.recordMeasurementsFromBatch(
      batchedValues
    );

    await updateJobs.submitUpdateJobs();
    return recordedMeasurements;
  }

  public async recordMetaData(data: BenchmarkData): Promise<{
    env: Environment;
    exp: Experiment;
    trial: Trial;
    criteria: Map<number, Criterion>;
  }> {
    const env = await this.recordEnvironment(data.env);
    const exp = await this.recordExperiment(data);
    const trial = await this.recordTrial(data, env, exp);

    let criteria;
    if (data.criteria) {
      criteria = await this.resolveCriteria(data.criteria);
    } else {
      criteria = null;
    }

    return { env, exp, trial, criteria };
  }

  public async recordAllData(
    data: BenchmarkData,
    suppressTimeline = false
  ): Promise<[number, number]> {
    const { trial, criteria } = await this.recordMetaData(data);

    let recordedMeasurements = 0;
    let recordedProfiles = 0;

    for (const r of data.data) {
      const run = await this.recordRun(r.runId);

      if (r.d) {
        const availableMs = await this.retrieveAvailableMeasurements(trial.id);
        recordedMeasurements += await this.recordMeasurements(
          r.d,
          run,
          trial,
          criteria,
          availableMs
        );
      }

      if (r.p) {
        recordedProfiles += await this.recordProfiles(r.p, run, trial);
      }
    }

    if (recordedMeasurements > 0 && this.timelineEnabled && !suppressTimeline) {
      this.generateTimeline();
    }

    return [recordedMeasurements, recordedProfiles];
  }

  public async recordMetaDataAndRuns(data: BenchmarkData): Promise<number> {
    await this.recordMetaData(data);

    for (const r of data.data) {
      await this.recordRun(r.runId);
    }

    return data.data.length;
  }

  public async recordMeasurementBatched10(values: any[]): Promise<number> {
    const q = this.queries.insertMeasurementBatched10;
    // [runId, trialId, invocation, iteration, critId, value];
    q.values = values;
    return (await this.query(q)).rowCount;
  }

  public async recordMeasurementBatchedN(values: any[]): Promise<number> {
    const q = this.queries.insertMeasurementBatchedN;
    // [runId, trialId, invocation, iteration, critId, value];
    q.values = values;
    return (await this.query(q)).rowCount;
  }

  public async recordMeasurement(values: any[]): Promise<number> {
    const q = this.queries.insertMeasurement;
    // [runId, trialId, invocation, iteration, critId, value];
    q.values = values;
    return (await this.query(this.queries.insertMeasurement)).rowCount;
  }

  public async recordProfile(
    runId: number,
    trialId: number,
    invocation: number,
    numIterations: number,
    value: string
  ): Promise<number> {
    const q = this.queries.insertProfile;
    q.values = [runId, trialId, invocation, numIterations, value];
    return (await this.query(this.queries.insertProfile)).rowCount;
  }

  public async recordTimelineJob(values: number[]): Promise<void> {
    await this.query(this.queries.insertTimelineJob, values);
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
        this.dbConfig.database,
        this.dbConfig.user,
        this.dbConfig.password,
        this.numReplicates
      ];
      const start = startRequest();
      execFile(
        timelineR,
        dbArgs,
        { cwd: workDir },
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
        }
      );
    });
    return prom;
  }
}

export class DatabaseWithPool extends Database {
  private pool: pg.Pool;

  constructor(
    config: PoolConfig,
    numReplicates = 1000,
    timelineEnabled = false
  ) {
    super(config, numReplicates, timelineEnabled);
    this.pool = new pg.Pool(config);
  }

  public async query<R extends QueryResultRow = any, I extends any[] = any[]>(
    queryTextOrConfig: string | QueryConfig<I>,
    values?: I
  ): Promise<pg.QueryResult<R>> {
    return this.pool.query(queryTextOrConfig, values);
  }

  public async close(): Promise<void> {
    await this.pool.end();
    (<any>this).pool = null;
  }
}

class TimelineUpdates {
  private jobs: Map<string, number[]>;
  private db: Database;

  constructor(db: Database) {
    this.jobs = new Map();
    this.db = db;
  }

  public recorded(trialId: number, runId: number, criterionId: number) {
    const id = `${trialId}-${runId}-${criterionId}`;
    if (!this.jobs.has(id)) {
      this.jobs.set(id, [trialId, runId, criterionId]);
    }
  }

  public async submitUpdateJobs() {
    for (const job of this.jobs.values()) {
      await this.db.recordTimelineJob(job);
    }
  }
}
