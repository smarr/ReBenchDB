import { Database } from "./db";

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
