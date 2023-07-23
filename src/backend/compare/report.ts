import { resolve } from 'node:path';
import { writeFile, readFile } from 'node:fs/promises';
import { existsSync, unlinkSync, rmSync } from 'node:fs';

import { Database } from '../db/db.js';
import { assert, log } from '../logging.js';
import { completeRequest, startRequest } from '../perf-tracker.js';
import { robustPath } from '../util.js';
import type { CompareGenView, CompareView } from '../../shared/view-types.js';
import { prepareCompareView } from './prep-data.js';
import * as dataFormatters from '../../shared/data-format.js';
import * as viewHelpers from '../../shared/helpers.js';
import { prepareTemplate } from '../../backend/templates.js';

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

interface ReportStatus {
  inProgress: boolean;
  e?: Error;
}

const reportGeneration = new Map<string, ReportStatus>();

const compareGenTpl = prepareTemplate(
  robustPath('backend/compare/html/gen-index.html'),
  false,
  robustPath('backend/compare/html')
);

export async function renderCompare(
  base: string,
  change: string,
  projectSlug: string,
  db: Database
): Promise<{
  content: string;
  inProgress: boolean;
  reportId: string;
  completionPromise: Promise<void>;
}> {
  const baselineHash6 = base.substring(0, 6);
  const changeHash6 = change.substring(0, 6);

  const reportId = getReportId(projectSlug, base, change);

  const data: CompareGenView = {
    project: projectSlug,
    baselineHash: base,
    changeHash: change,
    baselineHash6,
    changeHash6,
    completionPromise: Promise.resolve(),

    generatingReport: false,
    generationFailed: false,
    revisionFound: false
  };

  const revDetails = await db.revisionsExistInProject(
    projectSlug,
    base,
    change
  );

  if (!revDetails.dataFound) {
    data.generationFailed = true;
    data.generationOutput =
      `The requested project ${projectSlug} does not have data ` +
      `on the revisions ${base} and ${change}.`;
    data.generatingReport = false;
    data.revisionFound = false;
    return {
      content: compareGenTpl(data),
      inProgress: false,
      reportId,
      completionPromise: data.completionPromise
    };
  }

  data.base = revDetails.base;
  data.change = revDetails.change;
  data.revisionFound = true;

  const prevGenerationDetails = reportGeneration.get(reportId);
  const reportFile = getReportFilename(reportId);

  if (
    (!prevGenerationDetails || !prevGenerationDetails.inProgress) &&
    existsSync(reportFile)
  ) {
    return {
      content: await readFile(reportFile, 'utf-8'),
      inProgress: false,
      reportId,
      completionPromise: data.completionPromise
    };
  }

  data.currentTime = new Date().toISOString();

  // no previous attempt to generate
  if (!prevGenerationDetails) {
    const start = startRequest();

    data.generatingReport = true;

    // we are going to set of the report generation
    // let's indicate that, before we do it
    const reportStatus: ReportStatus = {
      inProgress: true
    };
    reportGeneration.set(reportId, reportStatus);

    const p = renderCompareViewToFile(
      base,
      change,
      projectSlug,
      reportFile,
      db
    );
    const pp = p
      .then(async () => {
        reportStatus.inProgress = false;
        await completeRequest(start, db, 'generate-report');
      })
      .catch(async (e) => {
        log.error('Report generation error', e);
        reportStatus.e = e;
        reportStatus.inProgress = false;
        await completeRequest(start, db, 'generate-report');
      });
    data.completionPromise = pp;
  } else if (prevGenerationDetails.e) {
    // if previous attempt failed
    data.generationFailed = true;
    data.generatingReport = false;
  } else {
    data.generatingReport = true;
  }

  return {
    content: compareGenTpl(data),
    inProgress: true,
    reportId,
    completionPromise: data.completionPromise
  };
}

export async function renderCompareViewToFile(
  base: string,
  change: string,
  projectSlug: string,
  file: string,
  db: Database
): Promise<void> {
  const text = await renderCompareViewToString(base, change, projectSlug, db);
  return writeFile(file, text, 'utf-8');
}

const compareTpl = prepareTemplate(
  robustPath('backend/compare/html/index.html'),
  false,
  robustPath('backend/compare/html')
);

export async function renderCompareViewToString(
  base: string,
  change: string,
  projectSlug: string,
  db: Database
): Promise<string> {
  const data = await getCompareViewData(base, change, projectSlug, db);
  return compareTpl({ ...data, dataFormatters, viewHelpers });
}

export async function getCompareViewData(
  base: string,
  change: string,
  projectSlug: string,
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
    revDetails.minDistinctLength,
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
