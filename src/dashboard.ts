import { readFileSync, existsSync, unlinkSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFile, ChildProcessPromise } from 'promisify-child-process';
import { QueryConfig } from 'pg';

import { TimedCacheValidity, Database, DatabaseConfig, Source } from './db.js';
import { startRequest, completeRequest } from './perf-tracker.js';
import { AllResults, BenchmarkCompletion } from './api.js';
import { GitHub } from './github.js';
import { robustPath, siteConfig, TotalCriterion } from './util.js';
import { assert, log } from './logging.js';
import {
  CompareView,
  WarmupData,
  WarmupDataForTrial,
  WarmupDataPerCriterion
} from './views/view-types.js';
import { prepareCompareView } from './stats-data-prep.js';

const reportOutputFolder = resolve(robustPath(`../resources/reports/`));

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
    /* let's just leave it as a string */
  }
  return data;
}

export async function dashMeasurements(
  projectSlug: string,
  runId: number,
  trialId1: number,
  trialId2: number,
  db: Database
): Promise<WarmupData | null> {
  const q = {
    name: 'fetchMeasurementsByProjectIdRunIdTrialId',
    text: `SELECT
              trialId,
              invocation, iteration, warmup,
              criterion.name as criterion,
              criterion.unit as unit,
              value
            FROM
              Measurement
              JOIN Trial ON trialId = Trial.id
              JOIN Experiment ON Trial.expId = Experiment.id
              JOIN Criterion ON criterion = criterion.id
              JOIN Run ON runId = run.id
              JOIN Project ON Project.id = Experiment.projectId
            WHERE Project.slug = $1
              AND runId = $2
              AND (trialId = $3 OR trialId = $4)
            ORDER BY trialId, criterion, invocation, iteration;`,
    values: [projectSlug, runId, trialId1, trialId2]
  };
  const result = await db.query(q);
  if (result.rows.length === 0) {
    return null;
  }

  const trial1: WarmupDataForTrial = {
    trialId: result.rows[0].trialid,
    warmup: result.rows[0].warmup,
    data: []
  };
  const trial2: WarmupDataForTrial = {
    trialId: result.rows[result.rows.length - 1].trialid,
    warmup: result.rows[result.rows.length - 1].warmup,
    data: []
  };
  // preprocess rows, but should already have it like this in the database...

  let trialId = 0;
  let currentTrial: WarmupDataForTrial | null = null;
  let lastCriterion = null;
  let critObject: WarmupDataPerCriterion | null = null;

  for (const r of result.rows) {
    if (trialId === 0) {
      trialId = r.trialid;
      currentTrial = trial1;
      lastCriterion = null;
    } else if (trialId !== r.trialid) {
      if (currentTrial === trial2) {
        throw Error(
          'Unexpected trialId change. We only expect two different ones.'
        );
      }
      trialId = r.trialid;
      currentTrial = trial2;
      lastCriterion = null;
    }

    if (lastCriterion === null || lastCriterion !== r.criterion) {
      lastCriterion = r.criterion;
      critObject = {
        criterion: r.criterion,
        unit: r.unit,
        values: []
      };
      currentTrial?.data.push(critObject);
    }

    if (critObject) {
      if (critObject.values[r.invocation - 1] === undefined) {
        critObject.values[r.invocation - 1] = [];
      }

      critObject.values[r.invocation - 1][r.iteration - 1] = r.value;
    }
  }

  return { trial1, trial2 };
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
  const baselineHash6 = base.substring(0, 6);
  const changeHash6 = change.substring(0, 6);
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
  const baselineHash6 = base.substring(0, 6);
  const changeHash6 = change.substring(0, 6);

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

export async function dashCompareNew(
  base: string,
  change: string,
  projectSlug: string,
  dbConfig: DatabaseConfig,
  db: Database
): Promise<CompareView> {
  const reportId = getReportId(projectSlug, base, change);

  const revDetails = await db.revisionsExistInProject(
    projectSlug,
    base,
    change
  );

  if (!revDetails.dataFound || !revDetails.base) {
    return {
      revisionFound: false,
      project: projectSlug,
      baselineHash: base,
      changeHash: change,
      baselineHash6: revDetails.baseCommitId6,
      changeHash6: revDetails.baseCommitId6
    };
  }

  const projectId = revDetails.base.projectid;
  assert(projectId === revDetails.change?.projectid, 'Project IDs must match');

  const results = await db.getMeasurementsForComparison(
    projectId,
    base,
    change
  );
  const environments = await db.getEnvironmentsForComparison(
    projectId,
    base,
    change
  );
  const profiles = await db.getProfileAvailability(projectId, base, change);

  return prepareCompareView(
    results,
    environments,
    profiles,
    reportId,
    projectSlug,
    revDetails,
    reportOutputFolder
  );
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
