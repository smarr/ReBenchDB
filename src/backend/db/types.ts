import { BenchmarkId } from '../../shared/api.js';
import { SummaryStatistics } from '../../shared/stats.js';

export interface DatabaseConfig {
  user: string;
  password: string;
  host: string;
  database: string;
  port: number;
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
  softId: number;
  name: string;
  version: string;
}

export interface Environment {
  envid: number;
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
  critid: number;
  name: string;
  unit: string;
}

export interface Project {
  projectid: number;
  name: string;
  slug: string;
  description: string;
  logo: string;
  showchanges: boolean;
  allresults: boolean;
  githubnotification: boolean;
  basebranch: string;
}

export interface Source {
  sourceid: number;
  repourl: string;
  branchortag: string;
  commitid: string;
  commitmessage: string;
  authorname: string;
  authoremail: string;
  committername: string;
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
  cmdline: string;

  /** The current working directory. */
  location: string;

  varvalue: string | null;
  cores: string | null;
  inputsize: string | null;
  extraargs: string | null;
  maxinvocationtime: number;
  miniterationtime: number;
  warmup: number | null;
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

/** As returned from database queries */
export interface MeasurementData {
  expid: number;
  runid: number;
  trialid: number;
  commitid: string;
  bench: string;
  exe: string;
  suite: string;
  cmdline: string;
  varvalue: string | null;
  cores: string | null;
  inputsize: string | null;
  extraargs: string | null;
  invocation: number;
  iteration: number;
  warmup: number | null;
  criterion: string;
  unit: string;
  value: number;
  envid: number;
}

export interface AvailableProfile extends BenchmarkId {
  commitid: string;
  runid: number;
}

export interface RunSettings {
  cmdline: string;

  varValue: string | null;
  cores: string | null;
  inputSize: string | null;
  extraArgs: string | null;
  warmup: number | null;

  simplifiedCmdline: string;
}

export interface CriterionData {
  name: string;
  unit: string;
}

export interface Measurements {
  criterion: CriterionData;

  /**
   * Indexed first by invocation, than by iteration.
   * Example to get the value of 3 invocation and 5 iteration: `values[3][5]`.
   */
  values: number[][];

  envId: number;
  runId: number;
  runSettings: RunSettings;
  commitId: string;
  stats?: SummaryStatistics;
}

export interface ProcessedResult {
  exe: string;
  suite: string;
  bench: string;

  measurements: Measurements[];
}

export interface RevisionData {
  projectid: number;
  name: string;
  sourceid: number;
  commitid: string;
  repourl: string;
  branchortag: string;
  commitmessage: string;
  authorname: string;
}

export interface RevisionComparison {
  dataFound: boolean;
  base?: RevisionData;
  change?: RevisionData;

  /** Keep the commit ids to simplify data passing. */
  baseCommitId: string;
  changeCommitId: string;
  baseCommitId6: string;
  changeCommitId6: string;
  minDistinctLength: number;
}
