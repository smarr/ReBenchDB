import { readFileSync, existsSync } from 'fs';
import { execFile } from 'child_process';
import { Database } from './db';
import { startRequest, completeRequest } from './perf-tracker';

/**
 * SELECT exp.id, exp.startTime, m.iteration, m.value FROM Source s
JOIN Experiment exp ON exp.sourceId = s.id
JOIN Measurement m ON  m.expId = exp.id
WHERE repoURL = 'https://github.com/smarr/ReBenchDB'
 */

export async function dashProjects(db: Database) {
  const result = await db.client.query(`SELECT * from Project`);
  return { projects: result.rows };
}

export async function dashResults(projectId, db: Database) {
  const result = await db.client.query(`SELECT trialId, iteration, value, criterion, b.name as benchmark
      FROM Measurement m
          JOIN Trial t ON  m.trialId = t.id
          JOIN Experiment e ON t.expId = e.id
          JOIN Run r ON m.runId = r.id
          JOIN Benchmark b ON r.benchmarkId = b.id
      WHERE projectId = $1
      ORDER BY t.startTime, m.iteration`, [projectId]);
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
    ORDER BY counts.table`);
  return { stats: result.rows };
}

export async function dashChanges(projectId, db) {
  const result = await db.client.query(`
      SELECT commitId, branchOrTag, projectId, repoURL, commitMessage FROM experiment
        JOIN Trial ON expId = experiment.id
        JOIN Source ON sourceId = source.id
        JOIN Project ON projectId = project.id
      WHERE project.id = $1
      GROUP BY commitId, branchOrTag, projectId, repoURL, commitMessage
      ORDER BY max(startTime) DESC`,
    [projectId]);
  return { changes: result.rows };
}

export async function dashDataOverview(projectId, db) {
  const result = await db.client.query(`
      SELECT
        exp.id as expId, exp.name, exp.description,
        min(t.startTime) as minStartTime,
        max(t.endTime) as maxEndTime, ARRAY_TO_STRING(ARRAY_AGG(DISTINCT t.username), ', ') as users,
        ARRAY_TO_STRING(ARRAY_AGG(DISTINCT src.commitId), ' ') as commitIds, ARRAY_TO_STRING(ARRAY_AGG(DISTINCT src.commitMessage), '\n\n') as commitMsgs,
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
    [projectId]);
  return { data: result.rows };
}


const reportGeneration = new Map();

export function dashCompare(base: string, change: string, project: string, dbConfig, db: Database) {
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
    data.currentTime = new Date().toISOString();

    const prevGenerationDetails = reportGeneration.get(reportId);

    // no previous attempt to generate
    if (!prevGenerationDetails) {
      const start = startRequest();

      data.generatingReport = true;
      // start generating a report
      const args = [
        `${__dirname}/../../src/views/somns.Rmd`,
        `${reportId}.html`,
        // paths created in package.json
        // output dir implicit, from cwd
        '.',
        `${__dirname}/../../tmp/interm`,
        `${__dirname}/../../tmp/knit`,
        base,
        change,
        '#729fcf',
        '#e9b96e',
        dbConfig.database,
        dbConfig.user,
        dbConfig.password,
        // R ReBenchDB library directory
        `${__dirname}/../../src/views/`
      ];

      console.log(`Generate Report: ${__dirname}/../../src/views/knitr.R ${args.join(' ')}`);

      execFile(`${__dirname}/../../src/views/knitr.R`, args, { cwd: `${__dirname}/../../resources/reports/` },
        async (error, stdout, stderr) => {
          if (error) {
            console.error(`Report generation error: ${error}`);
          }
          reportGeneration.set(reportId, {
            error, stdout, stderr,
            inProgress: false
          });

          await completeRequest(start, db, 'generate-report');
        });
      reportGeneration.set(reportId, {
        inProgress: true
      });
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

const expDataPreparation = new Map();

export async function dashGetExpData(expId: number, dbConfig, db: Database) {
  const result = await db.client.query(`
      SELECT
        exp.name as expName,
        exp.description as expDesc,
        p.id as pId,
        p.name as pName,
        p.description as pDesc
      FROM
        Experiment exp
      JOIN Project p ON exp.projectId = p.id

      WHERE exp.id = $1`,
    [expId]);

  let data: any;
  if (!result || result.rows.length !== 1) {
    data = {
      project: '',
      generationFailed: true,
      stdout: 'Experiment was not found'
    };
  } else {
    data = {
      project: result.rows[0].pname,
      expName: result.rows[0].expname,
      expDesc: result.rows[0].expDesc,
      projectId: result.rows[0].pid,
      projectDesc: result.rows[0].pdesc
    };
  }

  const expDataId = `${data.project}-${expId}`;
  const expDataFile = `${__dirname}/../../resources/exp-data/${expDataId}.qs`;

  if (existsSync(expDataFile)) {
    data.preparingData = false;
    data.downloadUrl = `/static/exp-data/${expDataId}.qs`;
  } else {
    data.currentTime = new Date().toISOString();

    const prevPrepDetails = expDataPreparation.get(expDataId);

    // no previous attempt to prepare data
    if (!prevPrepDetails) {
      const start = startRequest();

      data.preparingData = true;
      // start preparing data
      const args = [
        expId,
        `${__dirname}/../../src/views/`, // R ReBenchDB library directory
        dbConfig.user,
        dbConfig.password,
        dbConfig.database,
        expDataFile
      ];

      console.log(`Prepare Data for Download: ${__dirname}/../../src/stats/get-exp-data.R ${args.join(' ')}`);

      execFile(`${__dirname}/../../src/stats/get-exp-data.R`, args,
        async (error, stdout, stderr) => {
          if (error) {
            console.error(`Data preparation failed: ${error}`);
          }
          expDataPreparation.set(expDataId, {
            error, stdout, stderr,
            inProgress: false
          });

          await completeRequest(start, db, 'prep-exp-data');
        });
      expDataPreparation.set(expDataId, {
        inProgress: true
      });
    } else if (prevPrepDetails.error) {
      // if previous attempt failed
      data.generationFailed = true;
      data.stdout = prevPrepDetails.stdout;
      data.stderr = prevPrepDetails.stderr;
      data.preparingData = false;
    } else {
      data.preparingData = true;
    }
  }

  return data;
}

export async function dashBenchmarksForProject(db: Database, projectId: number) {
  const result = await db.client.query(`
    SELECT DISTINCT p.name, env.hostname, r.cmdline, b.name as benchmark, b.id as benchId, s.name as suiteName, s.id as suiteId, exe.name as execName, exe.id as execId FROM Project p
      JOIN Experiment exp    ON exp.projectId = p.id
      JOIN Trial t           ON t.expId = exp.id
      JOIN Source src        ON t.sourceId = src.id
      JOIN Environment env   ON t.envId = env.id
      JOIN Timeline tl       ON tl.trialId = t.id
      JOIN Run r             ON tl.runId = r.id
      JOIN Benchmark b       ON r.benchmarkId = b.id
      JOIN Suite s           ON r.suiteId = s.id
      JOIN Executor exe      ON r.execId = exe.id
      WHERE p.id = $1
    ORDER BY suiteName, execName, benchmark, hostname`,
    [projectId]);
  return { benchmarks: result.rows };
}

export async function dashTimelineForProject(db: Database, projectId: number) {
  const timelineP = db.client.query(`
  SELECT tl.*, src.id as sourceId, b.id as benchmarkId, exe.id as execId, s.id as suiteId, hostname FROM Timeline tl
    JOIN Run r          ON tl.runId = r.id
    JOIN Benchmark b    ON r.benchmarkId = b.id
    JOIN Suite s        ON r.suiteId = s.id
    JOIN Executor exe   ON r.execId = exe.id
    JOIN Trial t        ON trialId = t.id
    JOIN Environment env ON t.envId = env.id
    JOIN Experiment exp ON expId = exp.id
      JOIN Source src     ON sourceId = src.id
      JOIN Criterion      ON criterion = criterion.id
      JOIN Project p      ON exp.projectId = p.id

    WHERE
      criterion.name = 'total' AND
      p.id = $1
    ORDER BY
      s.name, exe.name, b.name, hostname, startTime`,
    [projectId]);

  const timelineDetailsP = db.client.query(`
      SELECT DISTINCT src.*, t.id as trialId, t.manualRun, t.startTime, t.userName, exp.name as expName, exp.description as expDesc  FROM Timeline tl
      JOIN Run r          ON tl.runId = r.id
      JOIN Benchmark b    ON r.benchmarkId = b.id
      JOIN Suite s        ON r.suiteId = s.id
      JOIN Executor exe   ON r.execId = exe.id
      JOIN Trial t        ON trialId = t.id
      JOIN Experiment exp ON expId = exp.id
        JOIN Source src     ON sourceId = src.id
        JOIN Criterion      ON criterion = criterion.id
        JOIN Project p      ON exp.projectId = p.id

      WHERE
        criterion.name = 'total' AND
        p.id = $1`,
    [projectId]);
  return {
    timeline: (await timelineP).rows,
    details: (await timelineDetailsP).rows
  };
}
