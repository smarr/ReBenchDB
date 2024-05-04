import { ParameterizedContext } from 'koa';
import {
  respondProjectIdNotFound,
  respondProjectNotFound
} from '../common/standard-responses.js';
import { prepareTemplate } from '../templates.js';
import { TimelineSuite } from '../../shared/api.js';
import { Database } from '../db/db.js';
import { robustPath } from '../util.js';
import { getNumberOrError } from '../request-check.js';
import { log } from '../logging.js';

const timelineTpl = prepareTemplate(
  robustPath('backend/timeline/timeline.html'),
  false
);

export async function getTimelineAsJson(
  ctx: ParameterizedContext,
  db: Database
): Promise<void> {
  ctx.type = 'application/json';

  const projectId = getNumberOrError(ctx, 'projectId');
  if (projectId === null) {
    log.error((ctx.body as any).error);
    return;
  }

  const runId = getNumberOrError(ctx, 'runId');
  if (runId === null) {
    log.error((ctx.body as any).error);
    return;
  }

  ctx.body = await db.getTimelineForRun(projectId, runId);
  if (ctx.body === null) {
    ctx.status = 500;
  }
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
    ctx.body = timelineTpl({
      project,
      benchmarks: await getLatestBenchmarksForTimelineView(project.id, db)
    });
    ctx.type = 'html';
  } else {
    respondProjectNotFound(ctx, ctx.params.projectSlug);
  }
}

export async function getLatestBenchmarksForTimelineView(
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
