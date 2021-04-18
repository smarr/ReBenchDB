export interface Executor {
  name: string;
  desc: string | null;
}

export interface Suite {
  name: string;
  desc: string | null;
  executor: Executor;
}

export interface RunDetails {
  maxInvocationTime: number;
  minIterationTime: number;
  warmup: number | null;
}

export interface Benchmark {
  name: string;
  suite: Suite;
  runDetails: RunDetails;
  desc?: string;
}

export interface RunId {
  benchmark: Benchmark;
  cmdline: string;
  location: string;

  varValue: number | string | null;
  cores: number | string | null;
  inputSize: number | string | null;
  extraArgs: string | null;
}

export interface Run {
  d: DataPoint[];
  runId: RunId;
}

export interface Measure {
  /** Criterion id. */
  c: number;

  /** Value */
  v: number;
}

export interface DataPoint {
  /** Invocation */
  in: number;

  /** Iteration */
  it: number;

  m: Measure[];
}

export interface Source {
  repoURL: string;
  branchOrTag: string;
  commitId: string;
  commitMsg: string;
  authorName: string;
  authorEmail: string;
  committerName: string;
  committerEmail: string;
}

export interface Environment {
  hostName: string;
  cpu: string;

  /** Advertised or nominal clock speed in Hertz. */
  clockSpeed: number;

  /** Total number of bytes of memory provided by the system. */
  memory: number;
  osType: string;
  software: VersionInfo[];

  userName: string;

  /**
   * Is set true when the data was gathered by a manual run,
   * possibly on a developer machine, instead of the usual benchmark server.
   */
  manualRun: boolean;

  /**
   * Settings reported by `rebench-denoise`.
   */
  denoise?: Record<string, string | boolean | number>;
}

export interface BenchmarkData {
  data: Run[];
  criteria: Criterion[];
  env: Environment;
  source: Source;

  experimentName: string;
  experimentDesc?: string;

  startTime: string;
  endTime?: string | null;
  projectName: string;
}

export interface BenchmarkCompletion {
  projectName: string;
  experimentName: string;
  endTime?: string | null;
}

export interface Criterion {
  /** Id used to identify a criterion tuple. */
  i: number;

  /** Name of the criterion. */
  c: string;

  /** Unit of the criterion. */
  u: string;
}

export interface Unit {
  name: string;
  desc: string;
  lessIsBetter: boolean;
}

export interface VersionInfo {
  name: string;
  version: string;
}
