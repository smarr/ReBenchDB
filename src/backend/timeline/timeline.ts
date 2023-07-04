import { ParameterizedContext } from 'koa';
import {
  respondProjectIdNotFound,
  respondProjectNotFound
} from '../common/standard-responses.js';
import { processTemplate } from '../templates.js';
import { TimelineSuite } from '../../shared/api.js';
import { Database } from '../db/db.js';

export async function getTimelineAsJson(
  ctx: ParameterizedContext,
  db: Database
): Promise<void> {
  ctx.body = await db.getTimelineForRun(
    Number(ctx.params.projectId),
    Number(ctx.params.runId)
  );
  if (ctx.body === null) {
    ctx.status = 500;
  }
  ctx.type = 'application/json';
}

/**
 * @deprecated remove for 1.0
 */
export async function redirectToNewTimelineUrl(
  ctx: ParameterizedContext,
  db: Database
): Promise<void> {
  const project = await db.getProject(Number(ctx.params.projectId));
  if (project) {
    ctx.redirect(`/${project.slug}/timeline`);
  } else {
    respondProjectIdNotFound(ctx, Number(ctx.params.projectId));
  }
}

export async function renderTimeline(
  ctx: ParameterizedContext,
  db: Database
): Promise<void> {
  const project = await db.getProjectBySlug(ctx.params.projectSlug);

  if (project) {
    ctx.body = processTemplate('../backend/timeline/timeline.html', {
      project,
      benchmarks: await getLatestBenchmarksForTimelineView(project.id, db)
    });
    ctx.type = 'html';
  } else {
    respondProjectNotFound(ctx, ctx.params.projectSlug);
  }
}

async function getLatestBenchmarksForTimelineView(
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
