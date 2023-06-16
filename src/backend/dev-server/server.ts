import { ParameterizedContext } from 'koa';
import { readFileSync } from 'node:fs';

import { log } from '../logging.js';
import { robustPath, robustSrcPath } from '../../util.js';

export async function serveStaticResource(
  ctx: ParameterizedContext
): Promise<void> {
  const filename = ctx.params.filename;
  log.debug(`serve ${filename}`);
  let path: string;

  // TODO: robustPath?
  if (filename.endsWith('.css')) {
    ctx.type = 'css';
    path = robustPath(`../resources/${filename}`);
  } else if (filename.endsWith('.js')) {
    ctx.type = 'application/javascript';
    if (filename.includes('uPlot')) {
      path = robustPath(`../resources/${filename}`);
    } else {
      path = robustSrcPath(`views/${filename}`);
    }
  } else if (filename.endsWith('.map')) {
    ctx.type = 'application/json';
    path = robustSrcPath(`views/${filename}`);
  } else if (filename.endsWith('.svg')) {
    ctx.type = 'image/svg+xml';
    path = robustPath(`../resources/${filename}`);
  } else if (filename.endsWith('.json.gz')) {
    ctx.type = 'application/json';
    ctx.set('Content-Encoding', 'gzip');
    path = robustPath(`../resources/${filename}`);
  } else {
    throw new Error(`Unsupported file type. Filename: ${filename}`);
  }
  ctx.body = readFileSync(path);
}

export async function serveViewJs(ctx: ParameterizedContext): Promise<void> {
  log.debug(`serve ${ctx.params.filename}`);
  let path: string;
  if (ctx.params.filename.endsWith('.ts')) {
    ctx.type = 'application/typescript';
    path = robustPath(`views/${ctx.params.filename}`);
  } else {
    throw new Error(`Unsupported file type ${ctx.params.filename}`);
  }
  ctx.body = readFileSync(path);
}

export async function serveReport(ctx: ParameterizedContext): Promise<void> {
  log.debug(`serve ${ctx.params.filename}`);
  const reportPath = robustPath(`../resources/reports`);
  ctx.body = readFileSync(
    `${reportPath}/${ctx.params.change}/figure-html/${ctx.params.filename}`
  );
  if (ctx.params.filename.endsWith('.svg')) {
    ctx.type = 'svg';
  } else if (ctx.params.filename.endsWith('.css')) {
    ctx.type = 'text/css';
  }
}
