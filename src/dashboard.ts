import { readFileSync, existsSync, unlinkSync, rmSync } from 'fs';
import { execFile, ChildProcessPromise } from 'promisify-child-process';
import {
  TimedCacheValidity,
  Database,
  DatabaseConfig,
  Source,
  MeasurementData,
  ProcessedResult,
  RunSettings,
  CriterionData,
  Measurements
} from './db.js';
import { startRequest, completeRequest } from './perf-tracker.js';
import { AllResults, BenchmarkCompletion, TimelineSuite } from './api.js';
import { GitHub } from './github.js';
import {
  robustPath,
  siteConfig,
  storeJsonGzip,
  TotalCriterion
} from './util.js';
import { getDirname } from './util.js';
import { log } from './logging.js';
import { QueryConfig } from 'pg';
import { calculateSummaryStatistics } from './stats.js';
import { simplifyCmdline } from './views/util.js';

const __dirname = getDirname(import.meta.url);

const reportOutputFolder = robustPath(`../resources/reports/`);

/**
 * SELECT exp.id, exp.startTime, m.iteration, m.value FROM Source s
JOIN Experiment exp ON exp.sourceId = s.id
JOIN Measurement m ON  m.expId = exp.id
WHERE repoURL = 'https://github.com/smarr/ReBenchDB'
 */

const resultsCache: AllResults[][] = [];
let resultsCacheValid: TimedCacheValidity | null = null;

export async function dashResults(
  projectId: number,
  db: Database
): Promise<AllResults[]> {
  if (
    resultsCache[projectId] &&
    resultsCacheValid !== null &&
    resultsCacheValid.isValid()
  ) {
    return resultsCache[projectId];
  }

  if (resultsCacheValid === null || !resultsCacheValid.isValid()) {
    resultsCache.length = 0;
  }
  resultsCacheValid = db.getStatsCacheValidity();

  const q: QueryConfig = {
    name: 'all-results',
    text: ` WITH Results AS (
              SELECT
                    value, b.name as benchmark,
                    rank() OVER (
                      PARTITION BY b.id
                      ORDER BY
                        t.startTime DESC,
                        m.invocation DESC,
                        m.iteration DESC
                    )
                    FROM Measurement m
                      JOIN Trial t ON  m.trialId = t.id
                      JOIN Experiment e ON t.expId = e.id
                      JOIN Run r ON m.runId = r.id
                      JOIN Benchmark b ON r.benchmarkId = b.id
                      JOIN Criterion c ON m.criterion = c.id
                    WHERE projectId = $1 AND
                      c.name = '${TotalCriterion}'
                    ORDER BY t.startTime, m.invocation, m.iteration
            ),
            LastHundred AS (
              SELECT rank, value, benchmark
              FROM Results
              WHERE rank <= 100
              ORDER BY benchmark, rank DESC
            )
            SELECT array_agg(value) as values, benchmark
            FROM LastHundred
            GROUP BY benchmark;`,
    values: [projectId]
  };
  const result = await db.query(q);
  resultsCache[projectId] = result.rows;
  return resultsCache[projectId];
}

export async function dashProfile(
  runId: number,
  trialId: number,
  db: Database
): Promise<any> {
  const result = await db.query({
    name: 'fetchProfileDataByRunIdTrialId',
    text: `
          SELECT substring(commitId, 1, 6) as commitid,
            benchmark.name as bench, executor.name as exe, suite.name as suite,
            cmdline, varValue, cores, inputSize, extraArgs,
            invocation, numIterations, warmup, value as profile
          FROM ProfileData
            JOIN Trial ON trialId = Trial.id
            JOIN Experiment ON expId = Experiment.id
            JOIN Source ON source.id = sourceId
            JOIN Run ON runId = run.id
            JOIN Suite ON suiteId = suite.id
            JOIN Benchmark ON benchmarkId = benchmark.id
            JOIN Executor ON execId = executor.id
          WHERE runId = $1 AND trialId = $2`,
    values: [runId, trialId]
  });

  const data = result.rows[0];
  try {
    data.profile = JSON.parse(data.profile);
  } catch (e) {
    /* let's just leave it a string */
  }
  return data;
}

let statisticsCache: { stats: any[] } | null = null;
let statsCacheValid: TimedCacheValidity | null = null;

export function statsCache(): TimedCacheValidity | null {
  return statsCacheValid;
}

export async function dashStatistics(db: Database): Promise<{ stats: any[] }> {
  if (
    statisticsCache !== null &&
    statsCacheValid !== null &&
    statsCacheValid.isValid()
  ) {
    return statisticsCache;
  }

  statsCacheValid = db.getStatsCacheValidity();

  const result = await db.query({
    name: 'fetchStats',
    text: `
        SELECT * FROM (
          SELECT 'Experiments' as table, count(*) as cnt FROM experiment
          UNION ALL
          SELECT 'Trials' as table, count(*) as cnt FROM trial
          UNION ALL
          SELECT 'Executors' as table, count(*) as cnt FROM executor
          UNION ALL
          SELECT 'Benchmarks' as table, count(*) as cnt FROM benchmark
          UNION ALL
          SELECT 'Projects' as table, count(*) as cnt FROM project
          UNION ALL
          SELECT 'Suites' as table, count(*) as cnt FROM suite
          UNION ALL
          SELECT 'Environments' as table, count(*) as cnt FROM environment
          UNION ALL
          SELECT 'Runs' as table, count(*) as cnt FROM run
          UNION ALL
          SELECT 'Measurements' as table, count(*) as cnt FROM measurement
        ) as counts
        ORDER BY counts.table`
  });
  statisticsCache = { stats: result.rows };
  return statisticsCache;
}

export async function dashChanges(
  projectId: number,
  db: Database
): Promise<{ changes: any[] }> {
  const result = await db.query({
    name: 'fetchAllChangesByProjectId',
    text: ` SELECT commitId, branchOrTag, projectId, repoURL, commitMessage,
                max(startTime) as experimentTime
            FROM experiment
            JOIN Trial ON expId = experiment.id
            JOIN Source ON sourceId = source.id
            JOIN Project ON projectId = project.id
            WHERE project.id = $1
            GROUP BY commitId, branchOrTag, projectId, repoURL, commitMessage
            ORDER BY max(startTime) DESC`,
    values: [projectId]
  });
  return { changes: result.rows };
}

export async function dashDataOverview(
  projectId: number,
  db: Database
): Promise<{ data: any[] }> {
  const result = await db.query({
    name: 'fetchDataOverview',
    text: `
        SELECT
          exp.id as expId, exp.name, exp.description,
          min(t.startTime) as minStartTime,
          max(t.endTime) as maxEndTime,
          ARRAY_TO_STRING(ARRAY_AGG(DISTINCT t.username), ', ') as users,
          ARRAY_TO_STRING(ARRAY_AGG(DISTINCT src.commitId), ' ') as commitIds,
          ARRAY_TO_STRING(ARRAY_AGG(DISTINCT src.commitMessage), '\n\n')
            as commitMsgs,
          ARRAY_TO_STRING(ARRAY_AGG(DISTINCT env.hostName), ', ') as hostNames,

          -- Accessing measurements and timeline should give the same results,
          -- but the counting in measurements is of course a lot slower
          --	count(m.*) as measurements,
          --	count(DISTINCT m.runId) as runs
          SUM(tl.numSamples) as measurements,
          count(DISTINCT tl.runId) as runs
        FROM experiment exp
        JOIN Trial t         ON exp.id = t.expId
        JOIN Source src      ON t.sourceId = src.id
        JOIN Environment env ON env.id = t.envId

        --JOIN Measurement m   ON m.trialId = t.id
        JOIN Timeline tl     ON tl.trialId = t.id

        WHERE exp.projectId = $1

        GROUP BY exp.name, exp.description, exp.id
        ORDER BY minStartTime DESC;`,
    values: [projectId]
  });
  return { data: result.rows };
}

const reportGeneration = new Map();

export function startReportGeneration(
  base: string,
  change: string,
  outputFile: string,
  dbConfig: DatabaseConfig,
  extraCmd = ''
): ChildProcessPromise {
  const args = [
    robustPath(`views/somns.R`),
    outputFile,
    getOutputImageFolder(outputFile),
    // R ReBenchDB library directory
    robustPath(`views/`),
    siteConfig.reportsUrl,
    base,
    change,
    dbConfig.database,
    dbConfig.user,
    dbConfig.password,
    dbConfig.host,
    String(dbConfig.port),
    extraCmd
  ];

  const cmd = 'Rscript';
  log.debug(`Generate Report: ${cmd} '${args.join(`' '`)}'`);

  return execFile(cmd, args, { cwd: reportOutputFolder });
}

export function getSummaryPlotFileName(outputFile: string): string {
  return getOutputImageFolder(outputFile) + '/overview.png';
}

export function getOutputImageFolder(outputFile: string): string {
  return outputFile.replace('.html', '_files');
}

export function getReportId(
  project: string,
  base: string,
  change: string
): string {
  const baselineHash6 = base.substr(0, 6);
  const changeHash6 = change.substr(0, 6);
  return `${project}-${baselineHash6}-${changeHash6}`;
}

export function getReportFilename(reportId: string): string {
  return `${reportOutputFolder}/${reportId}.html`;
}

export function dashDeleteOldReport(
  project: string,
  base: string,
  change: string
): void {
  const reportId = getReportId(project, base, change);
  const reportFilename = getReportFilename(reportId);
  if (existsSync(reportFilename)) {
    unlinkSync(reportFilename);
    rmSync(getOutputImageFolder(reportFilename), {
      recursive: true,
      force: true
    });
    reportGeneration.delete(reportId);
  }
}

export async function dashCompare(
  base: string,
  change: string,
  projectSlug: string,
  dbConfig: DatabaseConfig,
  db: Database
): Promise<any> {
  const baselineHash6 = base.substr(0, 6);
  const changeHash6 = change.substr(0, 6);

  const reportId = getReportId(projectSlug, base, change);

  const data: any = {
    project: projectSlug,
    baselineHash: base,
    changeHash: change,
    baselineHash6,
    changeHash6,
    reportId,
    completionPromise: Promise.resolve()
  };

  const revDetails = await db.revisionsExistInProject(
    projectSlug,
    base,
    change
  );
  if (!revDetails.dataFound) {
    data.generationFailed = true;
    data.stdout =
      `The requested project ${projectSlug} does not have data ` +
      `on the revisions ${base} and ${change}.`;
    data.stderr = '';
    data.generatingReport = false;
    return data;
  }

  Object.assign(data, revDetails);
  data.revDetails = revDetails.dataFound;

  const reportFile = getReportFilename(reportId);
  if (existsSync(reportFile)) {
    data.report = readFileSync(reportFile);
    data.generatingReport = false;
  } else {
    data.report = undefined;
    data.currentTime = new Date().toISOString();

    const prevGenerationDetails = reportGeneration.get(reportId);

    // no previous attempt to generate
    if (!prevGenerationDetails) {
      const start = startRequest();

      data.generatingReport = true;

      // we are going to set of the report generation
      // let's indicate that, before we do it
      reportGeneration.set(reportId, {
        inProgress: true
      });

      const p = startReportGeneration(
        base,
        change,
        `${reportId}.html`,
        dbConfig
      );
      const pp = p
        .then(async (result) => {
          reportGeneration.set(reportId, {
            stdout: result.stdout,
            stderr: result.stderr,
            inProgress: false
          });
          await completeRequest(start, db, 'generate-report');
        })
        .catch(async (e) => {
          const { stdout, stderr } = e;
          log.error('Report generation error', e);
          reportGeneration.set(reportId, {
            e,
            stdout,
            stderr,
            inProgress: false
          });
          await completeRequest(start, db, 'generate-report');
        });
      data.completionPromise = pp;
    } else if (prevGenerationDetails.error) {
      // if previous attempt failed
      data.generationFailed = true;
      data.stdout = prevGenerationDetails.stdout;
      data.stderr = prevGenerationDetails.stderr;
      data.generatingReport = false;
    } else {
      data.generatingReport = true;
    }
  }

  return data;
}

function asHumanMem(val: number, digits = 2): string {
  if (!val || val === 0) {
    return '';
  }

  let m = val;
  let i = 0;
  while (i < 4 && m > 1024) {
    m /= 1024;
    i += 1;
  }
  return m.toFixed(digits) + ['B', 'KB', 'MB', 'GB'][i];
}

function asHumanHz(val: number, digits = 2): string {
  if (!val || val === 0) {
    return '';
  }

  let h = val;
  let i = 0;
  while (i < 4 && h > 1000) {
    h /= 1000;
    i += 1;
  }
  return h.toFixed(digits) + ['Hz', 'kHz', 'MHz', 'GHz'][i];
}

export async function dashCompareNew(
  base: string,
  change: string,
  projectSlug: string,
  dbConfig: DatabaseConfig,
  db: Database
): Promise<any> {
  const baselineHash6 = base.substr(0, 6);
  const changeHash6 = change.substr(0, 6);

  const reportId = getReportId(projectSlug, base, change);

  const revDetails = await db.revisionsExistInProject(
    projectSlug,
    base,
    change
  );

  const data: any = {
    project: projectSlug,
    baselineHash: base,
    changeHash: change,
    baselineHash6,
    changeHash6,
    reportId,
    renderData: false
  };

  if (!revDetails.dataFound) {
    data.revisionNotFound = true;
    return data;
  }

  data.base = revDetails.base;
  data.change = revDetails.change;

  data.renderData = true;

  const results = await db.getMeasurementsForComparison(base, change);
  const envs: any[] = await db.getEnvironmentsForComparison(base, change);

  for (const e of envs) {
    e.clockspeedHuman = asHumanHz(e.clockspeed);
    e.memoryHuman = asHumanMem(e.memory);
  }

  const { nav, navExeComparison } = getNavigation(results);
  data.nav = nav;
  data.navExeComparison = navExeComparison;

  data.allMeasurements = collateMeasurements(results);
  data.stats = calculateAllStatistics(data.allMeasurements);
  data.envs = envs;

  return data;
}

function collateMeasurements(
  data: MeasurementData[]
): Map<string, Map<string, Map<string, ProcessedResult>>> {
  const byExeSuiteBench = new Map<
    string,
    Map<string, Map<string, ProcessedResult>>
  >();
  const runSettings = new Map<string, RunSettings>();
  const criteria = new Map<string, CriterionData>();

  for (const row of data) {
    const c = `${row.criterion}|${row.unit}`;

    let criterion = criteria.get(c);
    if (criterion === undefined) {
      criterion = {
        name: row.criterion,
        unit: row.unit
      };
      criteria.set(c, criterion);
    }

    let runSetting = runSettings.get(row.cmdline);
    if (runSetting === undefined) {
      runSetting = {
        cmdline: row.cmdline,
        varValue: row.varvalue,
        cores: row.cores,
        inputSize: row.inputsize,
        extraArgs: row.extraargs,
        warmup: row.warmup,
        simplifiedCmdline: simplifyCmdline(row.cmdline)
      };
      runSettings.set(row.cmdline, runSetting);
    }

    let forExeBySuiteBench = byExeSuiteBench.get(row.exe);
    if (forExeBySuiteBench === undefined) {
      forExeBySuiteBench = new Map();
      byExeSuiteBench.set(row.exe, forExeBySuiteBench);
    }

    let forSuiteByBench = forExeBySuiteBench.get(row.suite);
    if (forSuiteByBench === undefined) {
      forSuiteByBench = new Map();
      forExeBySuiteBench.set(row.suite, forSuiteByBench);
    }

    let benchResult = forSuiteByBench.get(row.bench);
    if (benchResult === undefined) {
      benchResult = {
        exe: row.exe,
        suite: row.suite,
        bench: row.bench,
        measurements: []
      };
      forSuiteByBench.set(row.bench, benchResult);
    }

    let m: Measurements | null = null;
    for (const mm of benchResult.measurements) {
      if (
        mm.envId == row.envid &&
        mm.commitId == row.commitid &&
        mm.criterion.name == row.criterion
      ) {
        m = mm;
        break;
      }
    }

    if (!m) {
      m = {
        criterion,
        values: [],
        envId: row.envid,
        commitId: row.commitid,
        runSettings: runSetting
      };
      benchResult.measurements.push(m);
    }

    if (!m.values[row.invocation]) {
      m.values[row.invocation] = [];
    }
    m.values[row.invocation][row.iteration] = row.value;
  }

  return byExeSuiteBench;
}

function compareMeasurementForSorting(a, b) {
  let r = a.runSettings.varValue?.localeCompare(b.runSettings.varValue);
  if (r !== 0) {
    return r;
  }

  r = a.runSettings.cores?.localeCompare(b.runSettings.cores);
  if (r !== 0) {
    return r;
  }

  r = a.runSettings.inputSize?.localeCompare(b.runSettings.inputSize);
  if (r !== 0) {
    return r;
  }

  r = a.runSettings.extraArgs?.localeCompare(b.runSettings.extraArgs);
  if (r !== 0) {
    return r;
  }

  r = a.envId - b.envId;
  if (r !== 0) {
    return r;
  }

  return a.commitId.localeCompare(b.commitId);
}

function calculateAllStatistics(
  byExeSuiteBench: Map<string, Map<string, Map<string, ProcessedResult>>>
) {
  let numBenchmarks = 0;
  for (const bySuite of byExeSuiteBench.values()) {
    for (const byBench of bySuite.values()) {
      for (const bench of byBench.values()) {
        // TODO: what do we want this to mean?
        // do we want this to be runIds? i.e., different command lines?
        numBenchmarks += 1;

        bench.measurements.sort(compareMeasurementForSorting);
        for (const m of bench.measurements) {
          m.stats = calculateSummaryStatistics(m.values.flat());
        }
      }
    }
  }

  // TODO: ideally, we would want all but the total criterion's to be picked up
  // dynamically, automatically
  return {
    all: {
      numBenchmarks,
      total: { geomean: 'TODO', min: 'TODO', max: 'TODO' },
      gcTime: { geomean: 'TODO', min: 'TODO', max: 'TODO' },
      allocatedBytes: { geomean: 'TODO', min: 'TODO', max: 'TODO' }
    }
  };
}

function getNavigation(data: MeasurementData[]) {
  const executors = new Map<string, Set<string>>();
  const allSuites = new Map<string, Set<string>>();

  for (const row of data) {
    let suites: Set<string> | undefined = executors.get(row.exe);
    if (!suites) {
      suites = new Set();
      executors.set(row.exe, suites);
    }
    suites.add(row.suite);

    let execs: Set<string> | undefined = allSuites.get(row.suite);
    if (!execs) {
      execs = new Set();
      allSuites.set(row.suite, execs);
    }
    execs.add(row.exe);
  }

  const result: { exeName: string; suites: string[] }[] = [];
  const exes = Array.from(executors.entries());
  exes.sort((a, b) => a[0].localeCompare(b[0]));
  for (const [key, val] of exes) {
    const suitesSorted = Array.from(val);
    suitesSorted.sort((a, b) => a.localeCompare(b));
    result.push({ exeName: key, suites: suitesSorted });
  }

  const suitesWithMultipleExecutors: string[] = [];
  for (const [suite, execs] of allSuites) {
    if (execs.size > 1) {
      suitesWithMultipleExecutors.push(suite);
    }
  }

  suitesWithMultipleExecutors.sort((a, b) => a.localeCompare(b));

  return {
    nav: result,
    navExeComparison: { suites: suitesWithMultipleExecutors }
  };
}

const expDataPreparation = new Map();

export async function dashGetExpData(
  projectSlug: string,
  expId: number,
  dbConfig: DatabaseConfig,
  db: Database
): Promise<any> {
  const result = await db.getExperimentDetails(expId, projectSlug);

  let data: any;
  if (!result) {
    data = {
      project: '',
      generationFailed: true,
      stdout: 'Experiment was not found'
    };
  } else {
    data = result;
  }

  const expDataId = `${data.project}-${expId}`;
  const expFileName = `exp-data/${expDataId}.json.gz`;
  const expDataFile = `${__dirname}/../../resources/${expFileName}`;

  if (existsSync(expDataFile)) {
    data.preparingData = false;
    data.downloadUrl = `${siteConfig.staticUrl}/${expFileName}`;
  } else {
    data.currentTime = new Date().toISOString();

    const prevPrepDetails = expDataPreparation.get(expDataId);

    // no previous attempt to prepare data
    if (!prevPrepDetails) {
      const start = startRequest();

      data.preparingData = true;

      const resultP = db.getExperimentMeasurements(expId);

      expDataPreparation.set(expDataId, {
        inProgress: true
      });

      resultP
        .then(async (data: any[]) => {
          await storeJsonGzip(data, expDataFile);
          expDataPreparation.set(expDataId, {
            inProgress: false
          });
        })
        .catch(async (error) => {
          log.error('Data preparation failed', error);
          expDataPreparation.set(expDataId, {
            error,
            inProgress: false
          });
        })
        .finally(async () => await completeRequest(start, db, 'prep-exp-data'));
    } else if (prevPrepDetails.error) {
      // if previous attempt failed
      data.generationFailed = true;
      data.preparingData = false;
    } else {
      data.preparingData = true;
    }
  }

  return data;
}

export async function dashBenchmarksForProject(
  db: Database,
  projectId: number
): Promise<{ benchmarks }> {
  const result = await db.getBenchmarksByProjectId(projectId);
  return { benchmarks: result };
}

export async function reportCompletion(
  dbConfig: DatabaseConfig,
  db: Database,
  github: GitHub | null,
  data: BenchmarkCompletion
): Promise<void> {
  await db.reportCompletion(data);

  const project = await db.getProjectByName(data.projectName);
  if (!project) {
    throw new Error(`No project with name ${data.projectName} found.`);
  }

  const change = await db.getSourceByNames(
    data.projectName,
    data.experimentName
  );
  const changeSha = change?.commitid;

  if (!changeSha) {
    throw new Error(
      `ReBenchDB failed to identify the change commit that's to be used for the
       comparison. There's likely an issue with
       project (${data.projectName}) or
       experiment (${data.experimentName}) name.`
    );
  }

  const baseline = await db.getBaselineCommit(data.projectName, changeSha);
  const baselineSha = baseline?.commitid;

  if (!baselineSha) {
    throw new Error(
      `ReBenchDB failed to identify the baseline commit that's to be used for
       the comparison. There may be an issue with
       project (${data.projectName}) or
       experiment (${data.experimentName}) name.
       The identified change commit is is ${changeSha}.
       It could be that the baseBranch is not configured in the database
       for this project.`
    );
  }

  const { reportId, completionPromise } = await dashCompare(
    baselineSha,
    changeSha,
    data.projectName,
    dbConfig,
    db
  );

  if (github !== null && project.githubnotification) {
    reportCompletionToGitHub(
      github,
      reportId,
      completionPromise,
      change,
      baselineSha,
      changeSha,
      data.projectName
    );
  }
}

function reportCompletionToGitHub(
  github: GitHub,
  reportId,
  completionPromise,
  change: Source | undefined,
  baselineSha: string,
  changeSha: string,
  projectName: string
) {
  const details = github.getOwnerRepoFromUrl(change?.repourl);
  if (!details) {
    throw new Error(
      `The repository URL does not seem to be for GitHub.
       Result notifications are currently only supported for GitHub.
       Repo URL: ${change?.repourl}`
    );
  }

  const reportUrl =
    siteConfig.publicUrl +
    `/compare/${projectName}/${baselineSha}/${changeSha}`;

  completionPromise
    .then(() => {
      const plotFile = getSummaryPlotFileName(reportId + '.html');
      const summaryPlot = siteConfig.staticUrl + `/reports/${plotFile}`;
      const msg = `#### Performance changes for ${baselineSha}...${changeSha}

![Summary Over All Benchmarks](${siteConfig.publicUrl}/${summaryPlot})
Summary Over All Benchmarks

[Full Report](${reportUrl})`;

      // - post comment
      github.postCommitComment(details.owner, details.repo, changeSha, msg);
    })
    .catch((e: any) => {
      const msg = `ReBench execution completed.

      See [full report](${reportUrl}) for results.

      <!-- Error occurred: ${e} -->
      `;
      github.postCommitComment(details.owner, details.repo, changeSha, msg);
    });
}

export async function dashLatestBenchmarksForTimelineView(
  projectId: number,
  db: Database
): Promise<TimelineSuite[] | null> {
  const results = await db.getLatestBenchmarksForTimelineView(projectId);
  if (results === null) {
    return null;
  }

  // filter out things we do not want to show
  // per grouping and the same benchmark:
  //  - remove cores, varValue, inputSize, or extraArgs when always the same
  for (const t of results) {
    for (const e of t.exec) {
      const allTheSame = new Map();

      for (const b of e.benchmarks) {
        let sameDesc = allTheSame.get(b.benchName);
        if (!sameDesc) {
          sameDesc = {
            varValue: true,
            varValueValue: b.varValue,
            cores: true,
            coresValue: b.cores,
            inputSize: true,
            inputSizeValue: b.inputSize,
            extraArgs: true,
            extraArgsValue: b.extraArgs
          };
          allTheSame.set(b.benchName, sameDesc);
        } else {
          if (sameDesc.varValue && sameDesc.varValueValue != b.varValue) {
            sameDesc.varValue = false;
          }
          if (sameDesc.cores && sameDesc.coresValue != b.cores) {
            sameDesc.cores = false;
          }
          if (sameDesc.inputSize && sameDesc.inputSizeValue != b.inputSize) {
            sameDesc.inputSize = false;
          }
          if (sameDesc.extraArgs && sameDesc.extraArgsValue != b.extraArgs) {
            sameDesc.extraArgs = false;
          }
        }
      }

      for (const b of e.benchmarks) {
        const sameDesc = allTheSame.get(b.benchName);
        if (sameDesc.varValue) {
          b.varValue = undefined;
        }
        if (sameDesc.cores) {
          b.cores = undefined;
        }
        if (sameDesc.inputSize) {
          b.inputSize = undefined;
        }
        if (sameDesc.extraArgs) {
          b.extraArgs = undefined;
        }
      }
    }
  }

  return results;
}
