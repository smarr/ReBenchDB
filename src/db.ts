import { readFileSync } from 'fs';
import { BenchmarkData, Executor, Suite, Benchmark, RunId, Source } from './api';
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

  private readonly queries = {
    fetchExecutorByName: 'SELECT * from Executor WHERE name = $1',
    insertExecutor: 'INSERT INTO Executor (name, description) VALUES ($1, $2) RETURNING *',

    fetchSuiteByName: 'SELECT * from Suite WHERE name = $1',
    insertSuite: 'INSERT INTO Suite (name, description) VALUES ($1, $2) RETURNING *',

    fetchBenchmarkByName: 'SELECT * from Benchmark WHERE name = $1',
    insertBenchmark: 'INSERT INTO Benchmark (name, description) VALUES ($1, $2) RETURNING *',

    fetchRunByUrl: 'SELECT * from Run WHERE cmdline = $1',
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
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`
  };

  constructor(config: PoolConfig) {
    this.client = new Pool(config);
    this.executors = new Map();
    this.suites = new Map();
    this.benchmarks = new Map();
    this.runs = new Map();
    this.sources = new Map();
  }

  public clearCache() {
    this.executors.clear();
    this.suites.clear();
    this.benchmarks.clear();
    this.runs.clear();
    this.sources.clear();
  }


  public async initializeDatabase() {
    const schema = loadScheme();
    return await this.client.query(schema);
  }

  public async activateTransactionSupport() {
    this.client = <PoolClient> await this.client.connect();
  }

  private async recordNameDesc(item, cache, fetchQ, insertQ) {
    if (cache.has(item.name)) {
      return cache.get(item.name);
    }

    let result = await this.client.query(fetchQ, [item.name]);
    if (result.rowCount === 0) {
      result = await this.client.query(insertQ, [item.name, item.desc]);
    }

    console.assert(result.rowCount === 1);
    this.executors.set(item.name, result.rows[0]);
    return result.rows[0];
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

    let result = await this.client.query(this.queries.fetchRunByUrl, [run.cmdline]);
    if (result.rowCount === 0) {
      result = await this.client.query(this.queries.insertRun, [
        run.cmdline, benchmark.id, exec.id, suite.id, run.location,
        run.cores, run.input_size, run.var_value,
        run.benchmark.run_details.max_invocation_time,
        run.benchmark.run_details.min_iteration_time,
        run.benchmark.run_details.warmup]);
    }
    console.assert(result.rowCount === 1);
    this.runs.set(run.cmdline, result.rows[0]);
    return result.rows[0];
  }

  public async recordSource(s: Source) {
    if (this.sources.has(s.commitId)) {
      return this.sources.get(s.commitId);
    }

    let result = await this.client.query(this.queries.fetchSourceByCommitId, [s.commitId]);
    if (result.rowCount === 0) {
      result = await this.client.query(this.queries.insertSource, [
        s.repoURL, s.branchOrTag, s.commitId, s.commitMsg,
        s.authorName, s.authorEmail, s.committerName, s.committerEmail]);
    }
    console.assert(result.rowCount === 1);
    this.sources.set(s.commitId, result.rows[0]);
    return result.rows[0];
  }

  public recordData(data: BenchmarkData) {
   // data.data[0].run_id.benchmark.suite.executor.
  }
}


