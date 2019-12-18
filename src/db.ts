import { readFileSync } from 'fs';
import { BenchmarkData, Executor, Suite, Benchmark, RunId, Source, Environment, Criterion } from './api';
import { Pool, PoolConfig, PoolClient } from 'pg';

export function loadScheme() {
  return readFileSync(`${__dirname}/db.sql`).toString();
}

export class Database {
  public client: Pool | PoolClient;

  private readonly executors: Map<string, any>;
  private readonly suites: Map<string, any>;
  private readonly benchmarks: Map<string, any>;
  private readonly runs: Map<string, any>;
  private readonly sources: Map<string, any>;
  private readonly envs: Map<string, any>;
  private readonly exps: Map<string, any>;
  private readonly criteria: Map<string, any>;

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
        cores, inputSize, varValue,
        maxInvocationTime, minIterationTime, warmup)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,

    fetchSourceByCommitId: 'SELECT * from Source WHERE commitId = $1',
    insertSource: `INSERT INTO Source (
        repoURL, branchOrTag, commitId, commitMessage,
        authorName, authorEmail, committerName, committerEmail)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    fetchEnvByHostName: 'SELECT * from Environment WHERE hostname =  $1',
    insertEnv: `INSERT INTO Environment (hostname, osType) VALUES ($1, $2) RETURNING *`,

    // TODO: add  AND startTime = $3
    fetchExpByUserEnvStart: 'SELECT * from Experiment WHERE username = $1 AND envId = $2',
    // TODO: add other fields
    insertExp: `INSERT INTO Experiment (username, envId, sourceId, manualRun)
      VALUES ($1, $2, $3, $4) RETURNING *`,

    //  [ runId, expId, invocation, iteration, critId, value]
    insertMeasurement: {
      name: 'insertMeasurement',
      text: `INSERT INTO Measurement
          (runId, expId, invocation, iteration, criterion, value)
        VALUES ($1, $2, $3, $4, $5, $6)`,
      values: <any[]> []
    },

    fetchCriterionByNameUnit: 'SELECT * from Criterion WHERE name = $1 AND unit = $2',
    insertCriterion: 'INSERT INTO Criterion (name, unit) VALUES ($1, $2) RETURNING *',
    fetchUnit: 'SELECT * from Unit WHERE name = $1',
    insertUnit: 'INSERT INTO Unit (name) VALUES ($1)'
  };

  constructor(config: PoolConfig) {
    this.client = new Pool(config);
    this.executors = new Map();
    this.suites = new Map();
    this.benchmarks = new Map();
    this.runs = new Map();
    this.sources = new Map();
    this.envs = new Map();
    this.exps = new Map();
    this.criteria = new Map();
  }

  public clearCache() {
    this.executors.clear();
    this.suites.clear();
    this.benchmarks.clear();
    this.runs.clear();
    this.sources.clear();
    this.envs.clear();
    this.exps.clear();
    this.criteria.clear();
  }

  public async initializeDatabase() {
    const schema = loadScheme();
    return await this.client.query(schema);
  }

  public async activateTransactionSupport() {
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

  public async recordExecutor(e: Executor) {
    return this.recordNameDesc(e, this.executors,
      this.queries.fetchExecutorByName, this.queries.insertExecutor);
  }

  public async recordSuite(s: Suite) {
    return this.recordNameDesc(s, this.suites,
      this.queries.fetchSuiteByName, this.queries.insertSuite);
  }

  public async recordBenchmark(b: Benchmark) {
    return this.recordNameDesc(b, this.benchmarks,
      this.queries.fetchBenchmarkByName, this.queries.insertBenchmark);
  }

  public async recordRun(run: RunId) {
    if (this.runs.has(run.cmdline)) {
      return this.runs.get(run.cmdline);
    }

    const exec = await this.recordExecutor(run.benchmark.suite.executor);
    const suite = await this.recordSuite(run.benchmark.suite);
    const benchmark = await this.recordBenchmark(run.benchmark);

    return this.recordCached(this.runs, run.cmdline,
      this.queries.fetchRunByCmd, [run.cmdline],
      this.queries.insertRun, [run.cmdline, benchmark.id, exec.id, suite.id, run.location,
      run.cores, run.input_size, run.var_value,
      run.benchmark.run_details.max_invocation_time,
      run.benchmark.run_details.min_iteration_time,
      run.benchmark.run_details.warmup]);
  }

  public async recordSource(s: Source) {
    return this.recordCached(this.sources, s.commitId,
      this.queries.fetchSourceByCommitId, [s.commitId],
      this.queries.insertSource, [
        s.repoURL, s.branchOrTag, s.commitId, s.commitMsg,
        s.authorName, s.authorEmail, s.committerName, s.committerEmail]);
  }

  public async recordEnvironment(e: Environment) {
    return this.recordCached(this.envs, e.hostName,
      this.queries.fetchEnvByHostName, [e.hostName],
      this.queries.insertEnv, [
        // TODO: much more missing
        e.hostName, e.osType ]);
  }

  public async recordExperiment(data: BenchmarkData, env) {
    const e = data.env;

    // TODO: need to use startTime
    const cacheKey = `${e.userName}-${env.id}-`;
    if (this.exps.has(cacheKey)) {
      return this.exps.get(cacheKey);
    }

    const source = await this.recordSource(data.source);
    return this.recordCached(this.exps, cacheKey,
      this.queries.fetchExpByUserEnvStart, [
        // TODO: add e.startTime
        e.userName, env.id],
      this.queries.insertExp, [
        // TODO: much more missing
        e.userName, env.id, source.id, e.manualRun, /* TODO...*/ ]);
  }

  private async recordUnit(unitName: string) {
    const result = await this.client.query(this.queries.fetchUnit, [unitName]);
    if (result.rowCount === 0) {
      await this.client.query(this.queries.insertUnit, [unitName]);
    }
  }

  public async recordCriterion(c: Criterion) {
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

  public async recordData(data: BenchmarkData) {
    const env = await this.recordEnvironment(data.env);
    const exp = await this.recordExperiment(data, env);

    const criteria = await this.resolveCriteria(data.criteria);

    for (const r of data.data) {
      const run = await this.recordRun(r.run_id);
      for (const d of r.d) {
        for (const m of d.m) {
          await this.recordMeasurement(run.id, exp.id, d.in, d.it, criteria.get(m.c).id, m.v);
        }
      }
    }
  }

  public async recordMeasurement(runId, expId, invocation: number, iteration: number, critId, value: number) {
    const q = this.queries.insertMeasurement;
    q.values = [runId, expId, invocation, iteration, critId, value];
    return await this.client.query(this.queries.insertMeasurement, );
  }
}


