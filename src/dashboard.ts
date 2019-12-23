import { readFileSync, existsSync } from 'fs';
import { execFile } from 'child_process';
import { Database } from './db';

/**
 * SELECT exp.id, exp.startTime, m.iteration, m.value FROM Source s
JOIN Experiment exp ON exp.sourceId = s.id
JOIN Measurement m ON  m.expId = exp.id
WHERE repoURL = 'https://github.com/smarr/ReBenchDB'
 */

export async function dashReBenchDb(db: Database) {
  const result = await db.client.query(`SELECT exp.id, m.iteration, m.value as value
    FROM Source s
    JOIN Experiment exp ON exp.sourceId = s.id
    JOIN Measurement m ON  m.expId = exp.id
    WHERE repoURL = 'https://github.com/smarr/ReBenchDB'
    ORDER BY exp.startTime, m.iteration`);
  const timeSeries: any[] = [];
  for (const r of result.rows) {
    timeSeries.push(r.value);
  }
  return { timeSeries };
}

export async function dashStatistics(db: Database) {
  const result = await db.client.query(`
    SELECT * FROM (
      SELECT 'Experiments' as table, count(*) as cnt FROM experiment
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
    ORDER BY counts.table`);
  return { stats: result.rows };
}

export async function dashChanges(projectName, db) {
  const result = await db.client.query(`
      SELECT commitId, branchOrTag, projectId, repoURL, commitMessage FROM experiment
        JOIN Source ON sourceid = source.id
        JOIN Project ON projectId = project.id
      WHERE name = $1
      GROUP BY commitId, branchOrTag, projectId, repoURL, commitMessage
      ORDER BY max(startTime) DESC`,
    [projectName]);
  return { changes: result.rows };
}

const reportGeneration = new Map();

export function dashCompare(base: string, change: string, project: string) {
  const baselineHash6 = base.substr(0, 6);
  const changeHash6 = change.substr(0, 6);

  const reportId = `${project}-${baselineHash6}-${changeHash6}`;

  const reportFile = `${__dirname}/../../resources/reports/${reportId}.html`;

  let data: any = {
    project,
    baselineHash6,
    changeHash6,
  };

  if (existsSync(reportFile)) {
    data.report = readFileSync(reportFile);
    data.generatingReport = false;
  } else {
    data.report = undefined;
    data.generatingReport = true;
    data.currentTime = new Date().toISOString();

    if (!reportGeneration.get(reportId)) {
      // start generating a report
      const args = [
        `${__dirname}/../../src/views/somns.Rmd`,
        `${__dirname}/../../resources/reports/${reportId}.html`,
        `${__dirname}/../../src/views/tmp-i`,
        `${__dirname}/../../src/views/tmp-k`,
        base,
        change,
        '#729fcf',
        '#e9b96e'
      ];

      console.log(`Generate Report: ${__dirname}/../../src/views/knitr.R ${args.join(' ')}`);

      execFile(`${__dirname}/../../src/views/knitr.R`, args,
        (error, stdout, stderr) => {
          if (error) {
            console.error(`Report generation error: ${error}`);
          }
          console.log(stdout);
          console.log(stderr);
          reportGeneration.set(reportId, false);
        });
      reportGeneration.set(reportId, true);
    }
  }

  return data;
}

