export interface Executor {
  name: string;

  /* no longer used */
  desc: string | null;
}

export interface Suite {
  name: string;
  desc: string | null;

  /* no longer used */
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

  /* no longer used */
  desc?: string;
}

export interface RunId {
  benchmark: Benchmark;
  cmdline: string;

  /** The current working directory. */
  location: string;

  varValue: number | string | null;
  cores: number | string | null;
  inputSize: number | string | null;
  extraArgs: string | null;
}

export interface Run {
  d?: DataPoint[];
  p?: ProfileData[];
  runId: RunId;
}

export type ValuesPossiblyMissing = (number | null)[];
export type CriterionWithoutData = null;

export interface DataPoint {
  /** Invocation */
  in: number;

  /**
   * An array of criteria with values order by iteration.
   * - some iterations may not yield data (ValuesPossiblyMissing)
   * - some criteria may not have data (CriterionWithoutData)
   */
  m: (ValuesPossiblyMissing | CriterionWithoutData)[];
}

export interface ProfileElement {
  /** Percent */
  p: number;

  /** Method, Function, Symbol Name */
  m: string;

  /** Stack Trace */
  t?: (ProfileElement | string)[];
}

export interface ProfileData {
  /** Data, can be anything. For the moment it should be ProfileElement[] */
  d: any | ProfileElement[];

  /** Invocation */
  in: number;

  /** Number of Iterations */
  nit: number;
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
  criteria?: Criterion[];
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

export interface BenchmarkId {
  /** benchmark name */
  b: string;

  /** exe name */
  e: string;

  /** suite name */
  s: string;

  /** varValue */
  v?: string;

  /** cores */
  c?: string;

  /** input size */
  i?: string;

  /** extra args */
  ea?: string;
}

export interface TimelineRequest extends BenchmarkId {
  /** commit id for baseline */
  baseline: string;

  /** commit id for change */
  change: string;
}

export interface TimelineResponse {
  baseBranchName: string | null;
  changeBranchName: string | null;
  baseTimestamp: number | null;
  changeTimestamp: number | null;
  data: PlotData;
  sourceIds: number[];
}

export type FullPlotData = [
  number[] /** UNIX time stamps */,

  /** Baseline Branch */

  /** bootstrap confidence interval, 95th, low,  millisecond values */
  (number | null)[],

  /** median, millisecond values */
  (number | null)[],

  /** bootstrap confidence interval, 95th, high, millisecond values */
  (number | null)[],

  /** Change Branch */

  /** bootstrap confidence interval, 95th, low, millisecond values */
  (number | null)[],

  /** median, millisecond values */
  (number | null)[],

  /** bootstrap confidence interval, 95th, high, millisecond values */
  (number | null)[]
];

export type BasePlotData = [
  number[] /** UNIX time stamps */,

  /** Baseline Branch */

  /** bootstrap confidence interval, 95th, low,  millisecond values */
  (number | null)[],

  /** median, millisecond values */
  (number | null)[],

  /** bootstrap confidence interval, 95th, high, millisecond values */
  (number | null)[]
];

export interface AllResults {
  benchmark: string;
  values: number[];
}

export type PlotData = FullPlotData | BasePlotData;

export interface TimelineSuite {
  suiteName: string;
  exec: TimelineExecutor[];
}

export interface TimelineExecutor {
  execName: string;
  benchmarks: TimelineBenchmark[];
}

export interface TimelineBenchmark {
  benchName: string;
  cmdline: string;
  runId: number;
  varValue?: string;
  cores?: string;
  inputSize?: string;
  extraArgs?: string;
}
