import { readFileSync } from 'node:fs';
import pg, { PoolConfig, QueryConfig } from 'pg';

import {
  BenchmarkData,
  RunId as ApiRunId,
  Source as ApiSource,
  Environment as ApiEnvironment,
  Criterion as ApiCriterion,
  DataPoint as ApiDataPoint,
  ProfileData as ApiProfileData,
  BenchmarkCompletion,
  TimelineRequest,
  TimelineResponse,
  PlotData,
  FullPlotData,
  TimelineSuite
} from '../../shared/api.js';
import { robustPath, TotalCriterion } from '../util.js';
import { assert } from '../logging.js';
import { simplifyCmdline } from '../../shared/util.js';
import type { SummaryStatistics } from '../../shared/stats.js';
import type {
  Baseline,
  Criterion,
  Environment,
  Experiment,
  MeasurementData,
  Metadata,
  Project,
  RevisionComparison,
  RevisionData,
  Run,
  Source,
  Trial
} from './types.js';
import { TimedCacheValidity } from './timed-cache-validity.js';
import { HasProfile } from './has-profile.js';
import type { BatchingTimelineUpdater } from '../timeline/timeline-calc.js';

export type AvailableMeasurements = {
  [runId: number]: {
    [critId: number]: { [inv: number]: number };
  };
};

type MeasurementValueArray = [
  /* runId */ number,
  /* trialId */ number,
  /* invocation */ number,
  /* critId */ number,
  /* values */ number[]
];

function isUniqueViolationError(err) {
  return err.code === '23505';
}

export function loadScheme(): string {
  const schema = robustPath('backend/db/db.sql');
  return readFileSync(schema).toString();
}

const measurementDataColumns = `
        expId, runId, trialId,
        substring(commitId, 1, $1) as commitid,
        benchmark as bench,
        executor as exe,
        suite,
        cmdline, varValue, cores, inputSize, extraArgs,
        invocation, warmup,
        criterion.name as criterion,
        criterion.unit as unit,
        values, envid`;

const measurementDataTableJoins = `
        Measurement
          JOIN Trial ON trialId = Trial.id
          JOIN Experiment ON expId = Experiment.id
          JOIN Source ON source.id = sourceId
          JOIN Criterion ON criterion = criterion.id
          JOIN Run ON runId = run.id`;

function filterCommitMessage(msg) {
  return msg
    .replaceAll('\\n', '\n') // resolve new lines
    .replace(/Signed-off-by:.*/g, '') // remove signed-off-by lines
    .trim();
}

export abstract class Database {
  protected readonly dbConfig: PoolConfig;

  private readonly runs: Map<string, Run>;
  private readonly sources: Map<string, Source>;
  private readonly envs: Map<string, Environment>;
  private readonly trials: Map<string, Trial>;
  private readonly exps: Map<string, Experiment>;
  private readonly criteria: Map<string, Criterion>;
  private readonly projects: Map<string, Project>;

  protected readonly timelineUpdater: BatchingTimelineUpdater | null;

  private readonly queries = {
    fetchProjectByName: 'SELECT * FROM Project WHERE name = $1',
    insertMeasurementBatchedN: 'GENERATED'
  };

  private static readonly batchN = 50;
  public static readonly batchInsertSize = 5;

  protected statsValid: TimedCacheValidity;

  constructor(
    config: PoolConfig,
    timelineUpdater: BatchingTimelineUpdater | null = null,
    cacheInvalidationDelay = 0
  ) {
    assert(config !== undefined);
    this.dbConfig = config;
    this.runs = new Map();
    this.sources = new Map();
    this.envs = new Map();
    this.exps = new Map();
    this.trials = new Map();
    this.criteria = new Map();
    this.projects = new Map();
    this.statsValid = new TimedCacheValidity(cacheInvalidationDelay);

    this.queries.insertMeasurementBatchedN = `INSERT INTO Measurement
         (runId, trialId, invocation, criterion, values)
       VALUES ${this.generateBatchInsert(
         Database.batchN,
         Database.batchInsertSize
       )}
       ON CONFLICT DO NOTHING`;

    this.timelineUpdater = timelineUpdater;
    if (timelineUpdater) {
      timelineUpdater.setDatabase(this);
    }
  }

  public getStatsCacheValidity(): TimedCacheValidity {
    return this.statsValid;
  }

  private invalidateStatsCache() {
    this.statsValid = this.statsValid.invalidateAndNew();
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

  public abstract query<R extends pg.QueryResultRow = any>(
    queryConfig: QueryConfig<any[]>
  ): Promise<pg.QueryResult<R>>;

  public clearCache(): void {
    this.runs.clear();
    this.sources.clear();
    this.envs.clear();
    this.exps.clear();
    this.trials.clear();
    this.criteria.clear();
    this.projects.clear();
  }

  private async needsTables() {
    const result = await this.query({
      name: 'doTableExist',
      text: `SELECT *
                FROM   information_schema.tables
                WHERE  table_name = 'run'`
    });
    return result.rowCount === null || result.rowCount <= 0;
  }

  public async initializeDatabase(): Promise<void> {
    if (await this.needsTables()) {
      const schema = loadScheme();
      await this.query({ text: schema });
    }
  }

  public async close(): Promise<void> {
    if (this.timelineUpdater) {
      await this.timelineUpdater.shutdown();
    }
  }

  private getSmallestDistinctCommitIdLength(
    base: string,
    change: string
  ): number {
    const minLength = Math.min(6, base.length, change.length);
    const maxLength = Math.max(base.length, change.length);
    let isDistinct = false;
    for (let i = 0; i < maxLength; i++) {
      if (base[i] !== change[i]) {
        isDistinct = true;
      }
      if (isDistinct && i > minLength) {
        return i;
      }
    }
    return maxLength;
  }

  public async revisionsExistInProject(
    projectSlug: string,
    base: string,
    change: string
  ): Promise<RevisionComparison> {
    const result = await this.query({
      name: 'fetchRevisionsInProjectByCommitIds',
      text: `SELECT DISTINCT
          p.id as projectId,
          e.name,
          s.id as sourceId,
          s.commitid, s.repoUrl, s.branchOrTag,
          s.commitMessage, s.authorName
        FROM Project p
          JOIN Experiment e ON e.projectId = p.id
          JOIN Trial t ON e.id = t.expId
          JOIN Source s ON t.sourceId = s.id
        WHERE lower(p.slug) = lower($1)
          AND s.commitid = $2
          OR s.commitid = $3`,
      values: [projectSlug, base, change]
    });

    const minDistinctLength = this.getSmallestDistinctCommitIdLength(
      base,
      change
    );
    const baseCommitId6 = base.substring(0, minDistinctLength);
    const changeCommitId6 = change.substring(0, minDistinctLength);

    // we can have multiple experiments with the same revisions
    if (result.rowCount !== null && result.rowCount >= 2) {
      let baseData: RevisionData | undefined = undefined;
      let changeData: RevisionData | undefined = undefined;
      for (const row of result.rows) {
        const r: RevisionData = row;
        if (row.commitid === base) {
          baseData = r;
        } else if (row.commitid === change) {
          changeData = r;
        }
      }

      if (baseData) {
        baseData.commitmessage = filterCommitMessage(baseData.commitmessage);
      }

      if (changeData) {
        changeData.commitmessage = filterCommitMessage(
          changeData.commitmessage
        );
      }

      return {
        dataFound: true,
        base: baseData,
        change: changeData,
        baseCommitId: base,
        changeCommitId: change,
        baseCommitId6,
        changeCommitId6,
        minDistinctLength
      };
    } else {
      return {
        dataFound: false,
        baseCommitId: base,
        changeCommitId: change,
        baseCommitId6,
        changeCommitId6,
        minDistinctLength
      };
    }
  }

  private async getCached(cache, cacheKey, fetchQ: QueryConfig): Promise<any> {
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey);
    }

    const result = await this.query(fetchQ);
    if (result.rowCount === 1) {
      return result[0];
    }
    return null;
  }

  private async recordCached(
    cache: Map<string, any>,
    cacheKey: string,
    fetchQ: QueryConfig,
    insertQ: QueryConfig
  ) {
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey);
    }

    let result = await this.query(fetchQ);
    if (result.rowCount === 0) {
      try {
        result = await this.query(insertQ);
      } catch (e) {
        // there may have been a racy insert,
        // which causes us to fail on unique constraints
        result = await this.query(fetchQ);
        if (result.rowCount === 0) {
          throw e;
        }
      }
    }

    assert(result.rowCount === 1);
    cache.set(cacheKey, result.rows[0]);
    return result.rows[0];
  }

  public async getBenchmarksByProjectId(projectId: number): Promise<
    {
      name: string;
      hostname: string;
      cmdline: string;
      benchmark: string;
      suitename: string;
      execname: string;
    }[]
  > {
    const result = await this.query({
      name: 'fetchBenchmarksByProjectId',
      text: `
          SELECT DISTINCT p.name, env.hostname, r.cmdline, r.benchmark,
              r.suite as suiteName,
              r.executor as execName
            FROM Project p
            JOIN Experiment exp    ON exp.projectId = p.id
            JOIN Trial t           ON t.expId = exp.id
            JOIN Source src        ON t.sourceId = src.id
            JOIN Environment env   ON t.envId = env.id
            JOIN Timeline tl       ON tl.trialId = t.id
            JOIN Run r             ON tl.runId = r.id
            WHERE p.id = $1
          ORDER BY suiteName, execName, benchmark, hostname`,
      values: [projectId]
    });
    return result.rows;
  }

  public async recordRun(run: ApiRunId): Promise<Run> {
    if (this.runs.has(run.cmdline)) {
      return <Run>this.runs.get(run.cmdline);
    }

    return this.recordCached(
      this.runs,
      run.cmdline,
      {
        name: 'fetchRunByCmdline',
        text: 'SELECT * from Run WHERE cmdline = $1',
        values: [run.cmdline]
      },
      {
        name: 'insertRun',
        text: `INSERT INTO Run (
                  cmdline,
                  benchmark, executor, suite,
                  location,
                  cores, inputSize, varValue, extraArgs,
                  maxInvocationTime, minIterationTime, warmup)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                RETURNING *`,
        values: [
          run.cmdline,
          run.benchmark.name,
          run.benchmark.suite.executor.name,
          run.benchmark.suite.name,
          run.location,
          run.cores,
          run.inputSize,
          run.varValue,
          run.extraArgs,
          run.benchmark.runDetails.maxInvocationTime,
          run.benchmark.runDetails.minIterationTime,
          run.benchmark.runDetails.warmup
        ]
      }
    );
  }

  public async recordSource(s: ApiSource): Promise<Source> {
    return this.recordCached(
      this.sources,
      s.commitId,
      {
        name: 'fetchSourceById',
        text: 'SELECT * from Source WHERE commitId = $1',
        values: [s.commitId]
      },
      {
        name: 'insertSource',
        text: `INSERT INTO Source (
                  repoURL, branchOrTag, commitId, commitMessage,
                  authorName, authorEmail, committerName, committerEmail)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        values: [
          s.repoURL,
          s.branchOrTag,
          s.commitId,
          s.commitMsg,
          s.authorName,
          s.authorEmail,
          s.committerName,
          s.committerEmail
        ]
      }
    );
  }

  public async recordEnvironment(e: ApiEnvironment): Promise<Environment> {
    return this.recordCached(
      this.envs,
      e.hostName,
      {
        name: 'fetchEnvironmentByHostname',
        text: 'SELECT * from Environment WHERE hostname =  $1',
        values: [e.hostName]
      },
      {
        name: 'insertEnvironment',
        text: `INSERT INTO Environment (
                  hostname, osType, memory, cpu, clockSpeed)
                VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        values: [e.hostName, e.osType, e.memory, e.cpu, e.clockSpeed]
      }
    );
  }

  public async recordTrial(
    data: BenchmarkData,
    env: Environment,
    exp: Experiment
  ): Promise<Trial> {
    const e = data.env;
    const cacheKey = `${e.userName}-${env.id}-${data.startTime}-${exp.id}`;

    if (this.trials.has(cacheKey)) {
      return <Trial>this.trials.get(cacheKey);
    }
    const source = await this.recordSource(data.source);

    return this.recordCached(
      this.trials,
      cacheKey,
      {
        name: 'fetchTrialByUserEnvIdStartTimeExpId',
        text: `SELECT * FROM Trial
                  WHERE username = $1 AND envId = $2 AND
                        startTime = $3 AND expId = $4`,
        values: [e.userName, env.id, data.startTime, exp.id]
      },
      {
        name: 'insertTrial',
        text: `INSERT INTO Trial (manualRun, startTime, expId, username,
                        envId, sourceId, denoise)
                VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        values: [
          e.manualRun,
          data.startTime,
          exp.id,
          e.userName,
          env.id,
          source.id,
          e.denoise
        ]
      }
    );
  }

  public async recordProject(projectName: string): Promise<Project> {
    return this.recordCached(
      this.projects,
      projectName,
      {
        name: 'fetchProjectByName',
        text: this.queries.fetchProjectByName,
        values: [projectName]
      },
      {
        name: 'insertProject',
        text: `INSERT INTO Project (name, slug)
                  VALUES ($1, regexp_replace($2, '[^0-9a-zA-Z-]', '-', 'g'))
                RETURNING *`,
        values: [projectName, projectName]
      }
    );
  }

  public async getProjectBySlug(
    projectNameSlug: string
  ): Promise<Project | undefined> {
    const q = {
      name: 'fetchProjectBySlugName',
      text: `SELECT * FROM Project
              WHERE lower($1) = lower(slug)`,
      values: [projectNameSlug]
    };

    const result = await this.query(q);

    if (result.rowCount !== 1) {
      return undefined;
    }
    return result.rows[0];
  }

  public async getProjectByExpId(expId: number): Promise<Project | undefined> {
    const q = {
      name: 'fetchProjectByExpId',
      text: `SELECT p.* FROM Project p
              JOIN Experiment e ON e.projectId = p.id
              WHERE e.id = $1`,
      values: [expId]
    };

    const result = await this.query(q);

    if (result.rowCount !== 1) {
      return undefined;
    }
    return result.rows[0];
  }

  public async getProjectByName(projectName: string): Promise<Project | null> {
    return <Promise<Project | null>>this.getCached(this.projects, projectName, {
      name: 'fetchProjectByName',
      text: this.queries.fetchProjectByName,
      values: [projectName]
    });
  }

  public async getAllProjects(): Promise<Project[]> {
    const result = await this.query({
      name: 'fetchAllProjects',
      text: 'SELECT * FROM Project ORDER BY position DESC'
    });
    return result.rows;
  }

  public async getProject(projectId: number): Promise<Project | undefined> {
    const result = await this.query({
      name: 'fetchProjectById',
      text: 'SELECT * FROM Project WHERE id = $1',
      values: [projectId]
    });

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
    const result = await this.query({
      text: `UPDATE Project
                SET baseBranch = $2
                WHERE name = $1`,
      values: [projectName, baseBranch]
    });
    return result.rowCount === 1;
  }

  public async getBaselineCommit(
    projectName: string,
    currentCommitId: string
  ): Promise<Baseline | undefined> {
    const result = await this.query({
      name: 'fetchBaselineCommit',
      text: `SELECT DISTINCT s.*, min(t.startTime) as firstStart
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
      values: [projectName, currentCommitId]
    });

    if (result.rowCount === null || result.rowCount < 1) {
      return undefined;
    } else {
      return result.rows[0];
    }
  }

  public async getSourceById(
    projectSlug: string,
    sourceId: string
  ): Promise<Source | null> {
    const q: QueryConfig = {
      name: 'get-source-by-slug-id',
      text: `SELECT DISTINCT s.*
              FROM Source s
                JOIN Trial t       ON t.sourceId = s.id
                JOIN Experiment e  ON e.id = t.expId
                JOIN Project p     ON p.id = e.projectId
              WHERE p.name = $1 AND s.id = $2
              LIMIT 1`,
      values: [projectSlug, sourceId]
    };

    const result = await this.query(q);
    if (result.rowCount === null || result.rowCount < 1) {
      return null;
    }
    return result.rows[0];
  }

  public async getSourceByNames(
    projectName: string,
    experimentName: string
  ): Promise<Source | undefined> {
    const result = await this.query({
      name: 'fetchSourceByProjectNameExpName',
      text: `SELECT DISTINCT s.*
              FROM Source s
                JOIN Trial t ON s.id = t.sourceId
                JOIN Experiment e ON e.id = t.expId
                JOIN Project p ON p.id = e.projectId
              WHERE p.name = $1 AND e.name = $2`,
      values: [projectName, experimentName]
    });

    if (result.rowCount === null || result.rowCount < 1) {
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
      {
        name: 'fetchExperimentByProjectIdAndName',
        text: 'SELECT * FROM Experiment WHERE projectId = $1 AND name = $2',
        values: [project.id, data.experimentName]
      },
      {
        name: 'insertExperiment',
        text: `INSERT INTO Experiment (name, projectId, description)
                  VALUES ($1, $2, $3) RETURNING *`,
        values: [data.experimentName, project.id, data.experimentDesc]
      }
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

    const result = await this.query({
      name: 'fetchExperimentByProjectNameExpName',
      text: `SELECT e.* FROM Experiment e
              JOIN Project p ON p.id = e.projectId
              WHERE p.name = $1 AND e.name = $2`,
      values: [projectName, experimentName]
    });

    if (result.rowCount === null || result.rowCount < 1) {
      return undefined;
    }
    return result.rows[0];
  }

  public async getExperimentDetails(
    expId: number,
    projectSlug: string
  ): Promise<{
    project: string;
    expName: string;
    expDesc: string;
    projectId: number;
    projectDesc: string;
  } | null> {
    const result = await this.query({
      name: 'fetchExpDataByIdAndProjectSlug',
      text: `SELECT
                  exp.name as expName,
                  exp.description as expDesc,
                  p.id as pId,
                  p.name as pName,
                  p.description as pDesc
                FROM
                  Experiment exp
                JOIN Project p ON exp.projectId = p.id

                WHERE exp.id = $1 AND
                  lower(p.slug) = lower($2)`,
      values: [expId, projectSlug]
    });
    if (!result || result.rows.length !== 1) {
      return null;
    }

    return {
      project: result.rows[0].pname,
      expName: result.rows[0].expname,
      expDesc: result.rows[0].expDesc,
      projectId: result.rows[0].pid,
      projectDesc: result.rows[0].pdesc
    };
  }

  public async getMeasurementsForComparison(
    projectId: number,
    minDistinctLength: number,
    commitHash1: string,
    commitHash2: string
  ): Promise<MeasurementData[]> {
    const result = await this.query({
      name: 'fetchMeasurementsForComparison',
      text: `SELECT
              ${measurementDataColumns}
            FROM
              ${measurementDataTableJoins}
            WHERE (commitId = $2 OR commitid = $3) AND Experiment.projectId = $4
              ORDER BY runId, expId, trialId, criterion, invocation`,
      values: [minDistinctLength, commitHash1, commitHash2, projectId]
    });
    return result.rows;
  }

  public async getEnvironmentsForComparison(
    projectId: number,
    commitHash1: string,
    commitHash2: string
  ): Promise<Environment[]> {
    const result = await this.query({
      name: 'fetchEnvForComparison',
      text: `SELECT
                env.id as id, env.hostname, env.ostype, env.memory,
                env.cpu, env.clockspeed, note
             FROM Source src
                JOIN Trial t         ON t.sourceId = src.id
                JOIN Experiment exp  ON exp.id = t.expId
                JOIN Environment env ON t.envId = env.id
             WHERE (commitId = $1 OR commitid = $2) AND exp.projectId = $3`,
      values: [commitHash1, commitHash2, projectId]
    });
    return result.rows;
  }

  public async getExperimentMeasurements(
    expId: number
  ): Promise<MeasurementData[]> {
    const result = await this.query({
      name: 'fetchExpMeasurements',
      text: `SELECT
                ${measurementDataColumns}
              FROM
                ${measurementDataTableJoins}
              WHERE
                Experiment.id = $2
              ORDER BY
                runId, trialId, cmdline, invocation, criterion`,
      values: [6, expId]
    });
    return result.rows;
  }

  public async storeExperimentMeasurements(
    expId: number,
    outputFile: string
  ): Promise<any[]> {
    // Postgres doesn't support parameters for COPY
    // so, just doing string substitution here
    const query = `COPY (
      SELECT
        ${measurementDataColumns.replace('$1', '6')}
      FROM
        ${measurementDataTableJoins}
      WHERE
        Experiment.id = ${expId}
      ORDER BY
        runId, trialId, cmdline, invocation, iteration, criterion
    ) TO PROGRAM 'gzip -9 > ${outputFile}'
      WITH (FORMAT csv, HEADER true)`;
    const result = await this.query({
      text: query
    });
    return result.rows;
  }

  public async recordExperimentCompletion(
    expId: number,
    endTime: string
  ): Promise<void> {
    await this.query({
      name: 'setTrialEndTime',
      text: `UPDATE Trial t
              SET endTime = $2
              WHERE expId = $1 AND endTime IS NULL`,
      values: [expId, endTime]
    });
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

  public async recordCriterion(c: ApiCriterion): Promise<Criterion> {
    const cacheKey = `${c.c}::${c.u}`;

    if (this.criteria.has(cacheKey)) {
      return <Criterion>this.criteria.get(cacheKey);
    }

    return this.recordCached(
      this.criteria,
      cacheKey,
      {
        name: 'fetchCriterionByNameAndUnit',
        text: 'SELECT * FROM Criterion WHERE name = $1 AND unit = $2',
        values: [c.c, c.u]
      },
      {
        name: 'insertCriterion',
        text: 'INSERT INTO Criterion (name, unit) VALUES ($1, $2) RETURNING *',
        values: [c.c, c.u]
      }
    );
  }

  private async resolveCriteria(
    data: ApiCriterion[]
  ): Promise<Map<number, Criterion>> {
    const criteria: Map<number, Criterion> = new Map();
    for (const cId in data) {
      const c = data[cId];
      criteria.set(parseInt(cId), await this.recordCriterion(c));
    }
    return criteria;
  }

  private async retrieveAvailableMeasurements(
    trialId: number
  ): Promise<AvailableMeasurements> {
    const results = await this.query({
      name: 'fetchAvailableMeasurements',
      text: `SELECT
              runId,
              criterion,
              invocation as inv,
              array_length(values, 1) as ite
            FROM Measurement
            WHERE trialId = $1
            GROUP BY runId, criterion, invocation, values
            ORDER BY runId, inv, ite, criterion`,
      values: [trialId]
    });

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

      assert(
        !(r.inv in crit),
        `${r.runid}, ${r.criterion}, ${r.inv} in ${JSON.stringify(crit)}`
      );
      crit[r.inv] = r.ite;
    }

    return measurements;
  }

  private alreadyRecorded(
    measurements: AvailableMeasurements,
    runId: number,
    inv: number,
    critId: number
  ) {
    if (runId in measurements) {
      const run = measurements[runId];
      if (critId in run) {
        const crit = run[critId];
        return inv in crit;
      }
    }

    return false;
  }

  private async recordMeasurementsFromBatch(batchedValues: any[]) {
    let recordedMeasurements = 0;

    while (batchedValues.length > 0) {
      // there are `batchInsertSize` parameters, i.e., values
      const rest = batchedValues.splice(Database.batchInsertSize * 1);
      try {
        assert(
          batchedValues.length == Database.batchInsertSize,
          `batchedValues.length was ${batchedValues.length} ` +
            `but expected ${Database.batchInsertSize}`
        );
        const result = await this.recordMeasurement(
          <MeasurementValueArray>batchedValues
        );
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

  /** Batched insertion is faster. */
  public createValueBatchForInsertion(
    dataPoints: ApiDataPoint[],
    run: Run,
    trial: Trial,
    criteria: Map<number, Criterion>,
    availableMs: AvailableMeasurements,
    batchedValues: any[]
  ): void {
    for (const d of dataPoints) {
      // a dataPoint contains m, which is a list of measurements per criterion
      for (const criterionId in d.m) {
        const m = d.m[criterionId];
        if (m === null || m === undefined) {
          continue;
        }

        const criterion = criteria.get(parseInt(criterionId))!;
        if (!criterion) {
          throw new Error(`Could not find criterion with id ${criterionId}`);
        }

        // batched inserts are much faster
        // so let's do this
        if (this.alreadyRecorded(availableMs, run.id, d.in, criterion.id)) {
          // then,just skip this one.
          continue;
        }

        if (this.timelineUpdater && criterion.name === TotalCriterion) {
          this.timelineUpdater.addValues(run.id, trial.id, criterion.id, m);
        }

        // batchedValues.push(run.id, trial.id, d.in, criterion.id, m);
        batchedValues.push(run.id, trial.id, d.in, criterion.id);
        batchedValues.push(m);
      }
    }
  }

  public async recordMeasurements(
    dataPoints: ApiDataPoint[],
    run: Run,
    trial: Trial,
    criteria: Map<number, Criterion>,
    availableMs: AvailableMeasurements
  ): Promise<number> {
    let recordedMeasurements = 0;
    let batchedValues: any[] = [];

    this.createValueBatchForInsertion(
      dataPoints,
      run,
      trial,
      criteria,
      availableMs,
      batchedValues
    );

    // first try to use the Database.batchN
    while (batchedValues.length >= Database.batchInsertSize * Database.batchN) {
      const rest = batchedValues.splice(
        Database.batchInsertSize * Database.batchN
      );

      try {
        const result = await this.recordMeasurementBatchedN(batchedValues);
        recordedMeasurements += result;
      } catch (err) {
        if (isUniqueViolationError(err)) {
          recordedMeasurements +=
            await this.recordMeasurementsFromBatch(batchedValues);
        }
      }
      batchedValues = rest;
    }

    // afterwards try batch of 10
    while (batchedValues.length >= Database.batchInsertSize * 10) {
      const rest = batchedValues.splice(Database.batchInsertSize * 10);
      try {
        const result = await this.recordMeasurementBatched10(batchedValues);
        recordedMeasurements += result;
      } catch (err) {
        if (isUniqueViolationError(err)) {
          recordedMeasurements +=
            await this.recordMeasurementsFromBatch(batchedValues);
        }
      }

      batchedValues = rest;
    }

    // and now handle remaining individually
    recordedMeasurements +=
      await this.recordMeasurementsFromBatch(batchedValues);

    return recordedMeasurements;
  }

  public async recordAdditionalMeasurementValue(
    run: Run,
    trial: Trial,
    criterionId: number,
    value: number
  ): Promise<void> {
    const q = {
      name: 'callRecordAdditionalMeasurement',
      text: 'CALL recordAdditionalMeasurement($1, $2, $3, $4)',
      values: [run.id, trial.id, criterionId, value]
    };

    await this.query(q);
  }

  public async recordMetaData(data: BenchmarkData): Promise<Metadata> {
    const env = await this.recordEnvironment(data.env);
    const exp = await this.recordExperiment(data);
    const trial = await this.recordTrial(data, env, exp);

    let criteria: Map<number, Criterion>;
    if (data.criteria) {
      criteria = await this.resolveCriteria(data.criteria);
    } else {
      criteria = new Map();
    }

    return { env, exp, trial, criteria };
  }

  public async recordAllData(
    data: BenchmarkData,
    suppressTimelineGeneration = false
  ): Promise<[number, number]> {
    this.invalidateStatsCache();
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

    if (
      recordedMeasurements > 0 &&
      this.timelineUpdater &&
      !suppressTimelineGeneration
    ) {
      this.timelineUpdater.submitUpdateJobs();
    }

    return [recordedMeasurements, recordedProfiles];
  }

  public getTimelineUpdater(): BatchingTimelineUpdater | null {
    return this.timelineUpdater;
  }

  public async recordMetaDataAndRuns(
    data: BenchmarkData
  ): Promise<{ metadata: Metadata; runs: Run[] }> {
    const metadata = await this.recordMetaData(data);
    const runs: Run[] = [];

    for (const r of data.data) {
      runs.push(await this.recordRun(r.runId));
    }

    return { metadata, runs };
  }

  public async recordMeasurementBatched10(values: any[]): Promise<number> {
    const q = {
      name: 'insertMeasurement10',
      text: `INSERT INTO Measurement
          (runId, trialId, invocation, criterion, values)
        VALUES
          ($1, $2, $3, $4, $5),
          ($6, $7, $8, $9, $10),
          ($11, $12, $13, $14, $15),
          ($16, $17, $18, $19, $20),
          ($21, $22, $23, $24, $25),
          ($26, $27, $28, $29, $30),
          ($31, $32, $33, $34, $35),
          ($36, $37, $38, $39, $40),
          ($41, $42, $43, $44, $45),
          ($46, $47, $48, $49, $50)
          ON CONFLICT DO NOTHING`,
      // [runId, trialId, invocation, critId, values];
      values
    };

    return (await this.query(q)).rowCount || 0;
  }

  // TODO: not used any longer, is this correct??

  public async recordMeasurementBatchedN(values: any[]): Promise<number> {
    assert(values.length === Database.batchInsertSize * Database.batchN);
    const q = {
      name: 'insertMeasurementN',
      text: this.queries.insertMeasurementBatchedN,
      // [runId, trialId, invocation, critId, values];
      values
    };
    return (await this.query(q)).rowCount || 0;
  }

  public async recordMeasurement(
    values: MeasurementValueArray
  ): Promise<number> {
    const q = {
      name: 'insertMeasurement',
      text: `INSERT INTO Measurement
          (runId, trialId, invocation, criterion, values)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT DO NOTHING`,
      // [runId, trialId, invocation, critId, values];
      values
    };

    return (await this.query(q)).rowCount || 0;
  }

  public async recordTimeline(
    runId: number,
    trialId: number,
    criterion: number,
    stats: SummaryStatistics
  ): Promise<number> {
    const q = {
      name: 'insertTimelineStats',
      text: `INSERT INTO timeline
              (runid, trialid, criterion,
               minval, maxval, sdval, mean, median,
               numsamples, bci95low, bci95up)
             VALUES
              ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             ON CONFLICT (runid, trialid, criterion) DO UPDATE
             SET
               minval = EXCLUDED.minval,
               maxval = EXCLUDED.maxval,
               sdval  = EXCLUDED.sdval,
               mean   = EXCLUDED.mean,
               median = EXCLUDED.median,
               numsamples = EXCLUDED.numsamples,
               bci95low = EXCLUDED.bci95low,
               bci95up = EXCLUDED.bci95up;`,
      values: [
        runId,
        trialId,
        criterion,
        stats.min,
        stats.max,
        stats.standardDeviation,
        stats.mean,
        stats.median,
        stats.numberOfSamples,
        stats.bci95low,
        stats.bci95up
      ]
    };
    return (await this.query(q)).rowCount || 0;
  }

  public async recordProfile(
    runId: number,
    trialId: number,
    invocation: number,
    numIterations: number,
    value: string
  ): Promise<number> {
    const q = {
      name: 'insertProfile',
      text: `INSERT INTO ProfileData
          (runId, trialId, invocation, numIterations, value)
        VALUES
          ($1, $2, $3, $4, $5)
        ON CONFLICT DO NOTHING`,
      values: [runId, trialId, invocation, numIterations, value]
    };
    return (await this.query(q)).rowCount || 0;
  }

  public async awaitQuiescentTimelineUpdater(): Promise<void> {
    await this.timelineUpdater?.awaitQuiescence();
  }

  public async getBranchNames(
    projectName: string,
    base: string,
    change: string
  ): Promise<null | { baseBranchName: string; changeBranchName: string }> {
    const q = {
      name: 'fetchBranchNamesForChange',
      text: `SELECT DISTINCT branchOrTag, s.commitId
             FROM Source s
               JOIN Trial      tr ON tr.sourceId = s.id
               JOIN Experiment e  ON tr.expId = e.id
               JOIN Project    p  ON p.id = e.projectId
             WHERE
               p.name = $1 AND
               (s.commitid = $2 OR s.commitid = $3)`,
      values: [projectName, base, change]
    };
    const result = await this.query(q);

    if (result.rowCount === null || result.rowCount < 1) {
      return null;
    }

    if (result.rowCount == 1) {
      return {
        baseBranchName: result.rows[0].branchortag,
        changeBranchName: result.rows[0].branchortag
      };
    }

    assert(result.rowCount == 2);
    if (result.rows[0].commitid == base) {
      return {
        baseBranchName: result.rows[0].branchortag,
        changeBranchName: result.rows[1].branchortag
      };
    }

    assert(result.rows[0].commitid == change);
    return {
      baseBranchName: result.rows[1].branchortag,
      changeBranchName: result.rows[0].branchortag
    };
  }

  public async getProfileAvailability(
    projectId: number,
    commitId1: string,
    commitId2: string
  ): Promise<HasProfile> {
    const q = {
      name: 'fetchProfileAvailability',
      text: `SELECT DISTINCT
                benchmark as b,
                executor as e,
                suite as s,
                varValue as v,
                cores as c,
                inputSize as i,
                extraArgs as ea,
                commitId, runId
              FROM ProfileData pd
                JOIN Trial ON pd.trialId = Trial.id
                JOIN Experiment e ON trial.expId = e.id
                JOIN Source ON source.id = sourceId
                JOIN Run ON runId = run.id
              WHERE
                (commitId = $1 OR commitId = $2)
                AND e.projectId = $3
              ORDER BY
                b, e, s, v, c, i, ea, runId, commitId`,
      values: [commitId1, commitId2, projectId]
    };

    const result = await this.query(q);
    return new HasProfile(result.rows);
  }

  public async getLatestBenchmarksForTimelineView(
    projectId: number
  ): Promise<TimelineSuite[] | null> {
    const q = {
      name: 'fetchLatestBenchmarksForProject',
      text: `WITH LatestExperiment AS (
                SELECT exp.id as expId, max(t.startTime) as newest
                FROM Project p
                  JOIN Experiment exp    ON exp.projectId = p.id
                  JOIN Trial t           ON t.expId = exp.id
                  JOIN Source src        ON t.sourceId = src.id
                WHERE p.id = $1 AND
                  p.baseBranch = src.branchOrTag
                GROUP BY exp.id
                ORDER BY newest DESC
                LIMIT 1
              )
              SELECT DISTINCT
                suite as suiteName,
                executor as execName,
                benchmark,
                r.cmdline,
                r.id as runId,
                r.varValue,
                r.cores,
                r.inputSize,
                r.extraArgs
              FROM Project p
                JOIN Experiment exp    ON exp.projectId = p.id
                JOIN Trial t           ON t.expId = exp.id
                JOIN Source src        ON t.sourceId = src.id
                JOIN Environment env   ON t.envId = env.id
                JOIN Timeline tl       ON tl.trialId = t.id
                JOIN Run r             ON tl.runId = r.id
                JOIN LatestExperiment le ON exp.id = le.expId
              WHERE
                p.id = $1 AND
                p.baseBranch = src.branchOrTag
              ORDER BY suiteName, execName, benchmark, cmdline;`,
      values: [projectId]
    };

    const result = await this.query(q);
    if (result.rowCount === null || result.rowCount < 1) {
      return null;
    }

    let suite: string | null = null;
    let executor: string | null = null;

    const suites: TimelineSuite[] = [];
    let currentSuite: TimelineSuite | null = null;
    let currentExec: any = null;

    for (const r of result.rows) {
      if (r.suitename !== suite) {
        currentSuite = {
          suiteName: r.suitename,
          exec: []
        };
        suites.push(currentSuite);
        suite = r.suitename;
      }

      if (r.execname !== executor) {
        currentExec = {
          execName: r.execname,
          benchmarks: []
        };
        currentSuite?.exec.push(currentExec);
        executor = r.execname;
      }

      currentExec.benchmarks.push({
        benchName: r.benchmark,
        cmdline: simplifyCmdline(r.cmdline),
        runId: r.runid,
        varValue: r.varvalue,
        cores: r.cores,
        inputSize: r.inputsize,
        extraArgs: r.extraargs
      });
    }

    return suites;
  }

  public async getTimelineForRun(
    projectId: number,
    runId: number
  ): Promise<TimelineResponse | null> {
    const q = this.constructTimelineQueryForRun(projectId, runId);
    const result = await this.query(q);

    if (result.rowCount === null || result.rowCount < 1) {
      return null;
    }

    return this.convertToTimelineResponse(result.rows, null, null);
  }

  public async getTimelineData(
    projectName: string,
    request: TimelineRequest
  ): Promise<TimelineResponse | null> {
    const branches = await this.getBranchNames(
      projectName,
      request.baseline,
      request.change
    );

    if (branches === null) {
      return null;
    }

    const q = this.constructTimelineQuery(projectName, branches, request);
    const result = await this.query(q);

    if (result.rowCount === null || result.rowCount < 1) {
      return null;
    }

    const data = this.convertToTimelineResponse(
      result.rows,
      branches.baseBranchName,
      branches.changeBranchName
    );
    return data;
  }

  private convertToTimelineResponse(
    rows: any[],
    baseBranchName: string | null,
    changeBranchName: string | null
  ): TimelineResponse {
    let baseTimestamp: number | null = null;
    let changeTimestamp: number | null = null;
    const sourceIds: number[] = [];
    const data: PlotData =
      baseBranchName !== null
        ? [
            [], // time stamp
            [], // baseline bci low
            [], // baseline median
            [], // baseline bci high
            [], // change bci low
            [], // change median
            [] // change bci high
          ]
        : [
            [], // time stamp
            [], // baseline bci low
            [], // baseline median
            [] // baseline bci high
          ];

    for (const row of rows) {
      data[0].push(row.starttime);
      sourceIds.push(<number>parseInt(row.sourceid));
      if (baseBranchName === null || row.branch == baseBranchName) {
        if (baseBranchName !== null && row.iscurrent) {
          baseTimestamp = row.starttime;
        }
        data[1].push(row.bci95low);
        data[2].push(row.median);
        data[3].push(row.bci95up);
        if (baseBranchName !== null) {
          (<FullPlotData>data)[4].push(null);
          (<FullPlotData>data)[5].push(null);
          (<FullPlotData>data)[6].push(null);
        }
      } else {
        if (row.iscurrent) {
          changeTimestamp = row.starttime;
        }
        data[1].push(null);
        data[2].push(null);
        data[3].push(null);
        if (baseBranchName !== null) {
          (<FullPlotData>data)[4].push(row.bci95low);
          (<FullPlotData>data)[5].push(row.median);
          (<FullPlotData>data)[6].push(row.bci95up);
        }
      }
    }

    return {
      baseBranchName,
      changeBranchName,
      baseTimestamp,
      changeTimestamp,
      data,
      sourceIds
    };
  }

  private constructTimelineQueryForRun(
    projectId: number,
    runId: number
  ): QueryConfig {
    const sql = `
      SELECT
        extract(epoch from tr.startTime at time zone 'UTC')::int as startTime,
        s.branchOrTag as branch,
        s.id as sourceId,
        ti.median, ti.bci95low, ti.bci95up
      FROM Timeline ti
        JOIN Trial      tr ON tr.id = ti.trialId
        JOIN Source     s  ON tr.sourceId = s.id
        JOIN Experiment e  ON tr.expId = e.id
        JOIN Project    p  ON p.id = e.projectId
        JOIN Run        r  ON r.id = ti.runId
        JOIN Criterion  c  ON ti.criterion = c.id
      WHERE
        s.branchOrTag = p.baseBranch AND
        p.id = $1   AND
        r.id = $2   AND
        c.name   = '${TotalCriterion}'
      ORDER BY tr.startTime ASC;
    `;
    return {
      name: 'get-timeline-data-for-pid-runid',
      text: sql,
      values: [projectId, runId]
    };
  }

  private constructTimelineQuery(
    projectName: string,
    branches: { baseBranchName: string; changeBranchName: string },
    request: TimelineRequest
  ): QueryConfig {
    let sql = `
      SELECT
        extract(epoch from tr.startTime at time zone 'UTC')::int as startTime,
        s.branchOrTag as branch, s.commitid IN ($1, $2) as isCurrent,
        s.id as sourceId,
        ti.median, ti.bci95low, ti.bci95up
      FROM Timeline ti
        JOIN Trial      tr ON tr.id = ti.trialId
        JOIN Source     s  ON tr.sourceId = s.id
        JOIN Experiment e  ON tr.expId = e.id
        JOIN Project    p  ON p.id = e.projectId
        JOIN Run        r  ON r.id = ti.runId
        JOIN Criterion  c  ON ti.criterion = c.id
      WHERE
        s.branchOrTag IN ($3, $4) AND
        p.name    = $5   AND
        benchmark = $6   AND
        suite    = $7  AND
        executor = $8 AND
        c.name   = '${TotalCriterion}'
        ::ADDITIONAL-PARAMETERS::
      ORDER BY tr.startTime ASC;
    `;

    let additionalParameters = '';
    let storedQueryName = 'get-timeline-data-bpbs-';

    const parameters = [
      request.baseline,
      request.change,
      branches.baseBranchName,
      branches.changeBranchName,
      projectName,
      request.b,
      request.s,
      request.e
    ];

    if (request.v) {
      parameters.push(request.v);
      additionalParameters += 'AND r.varValue = $' + parameters.length + ' ';
      storedQueryName += 'v';
    }

    if (request.c) {
      parameters.push(request.c);
      additionalParameters += 'AND r.cores = $' + parameters.length + ' ';
      storedQueryName += 'c';
    }

    if (request.i) {
      parameters.push(request.i);
      additionalParameters += 'AND r.inputSize = $' + parameters.length + ' ';
      storedQueryName += 'i';
    }

    if (request.ea) {
      parameters.push(request.ea);
      additionalParameters += 'AND r.extraArgs = $' + parameters.length + ' ';
      storedQueryName += 'ea';
    }

    sql = sql.replace('::ADDITIONAL-PARAMETERS::', additionalParameters);

    return {
      name: storedQueryName,
      text: sql,
      values: parameters
    };
  }
}
