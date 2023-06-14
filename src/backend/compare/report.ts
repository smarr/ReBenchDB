import { resolve } from 'node:path';
import { existsSync, readFileSync, unlinkSync, rmSync } from 'node:fs';
import { execFile, ChildProcessPromise } from 'promisify-child-process';

import { Database, DatabaseConfig } from '../../db.js';
import { assert, log } from '../../logging.js';
import { completeRequest, startRequest } from '../../perf-tracker.js';
import { robustPath, siteConfig } from '../../util.js';
import type { CompareView } from '../../views/view-types.js';
import { prepareCompareView } from './prep-data.js';

const reportOutputFolder = resolve(robustPath(`../resources/reports/`));

export function getReportId(
  project: string,
  base: string,
  change: string
): string {
  const baselineHash6 = base.substring(0, 6);
  const changeHash6 = change.substring(0, 6);
  return `${project}-${baselineHash6}-${changeHash6}`;
}

export function getSummaryPlotFileName(outputFile: string): string {
  return getOutputImageFolder(outputFile) + '/overview.png';
}

export function getOutputImageFolder(outputFile: string): string {
  return outputFile.replace('.html', '_files');
}

export function getReportFilename(reportId: string): string {
  return `${reportOutputFolder}/${reportId}.html`;
}

const reportGeneration = new Map();

export async function renderCompare(
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

export async function renderCompareNew(
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

export function deleteReport(
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
