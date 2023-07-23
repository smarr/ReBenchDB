import { ParameterizedContext } from 'koa';

import type { DatabaseConfig, Source } from '../db/types.js';
import { Database } from '../db/db.js';

import { Octokit } from '@octokit/rest';
import { createAppAuth } from '@octokit/auth-app';
import { existsSync, readFileSync } from 'fs';
import { log } from '../logging.js';
import { BenchmarkCompletion } from '../../shared/api.js';
import { dbConfig, siteConfig } from '../util.js';
import { getSummaryPlotFileName, renderCompare } from '../compare/report.js';

export async function handleReBenchCompletion(
  ctx: ParameterizedContext,
  db: Database
): Promise<void> {
  const data: BenchmarkCompletion = await ctx.request.body;
  ctx.type = 'text';

  if (!data.experimentName || !data.projectName) {
    ctx.body =
      'Completion request misses mandatory fields. ' +
      'In needs to have experimentName, and projectName';
    ctx.status = 400;
    return;
  }

  try {
    await reportCompletion(dbConfig, db, github, data);
    log.debug(
      `/rebenchdb/completion: ${data.projectName}` +
        `${data.experimentName} was completed`
    );
    ctx.status = 201;
    ctx.body =
      `Completion recorded of ` + `${data.projectName} ${data.experimentName}`;
  } catch (e: any) {
    ctx.status = 500;
    ctx.body = `Failed to record completion: ${e}\n${e.stack}`;
    log.error('/rebenchdb/completion failed to record completion:', e);
  }
}

async function reportCompletion(
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

  const { reportId, completionPromise } = await renderCompare(
    baselineSha,
    changeSha,
    data.projectName,
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
  reportId: string,
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

export interface Repo {
  owner: string;
  repo: string;
}

export function createGitHubClient(siteConfig: {
  appId: number;
  githubPrivateKey: string;
}): GitHub | null {
  if (existsSync(siteConfig.githubPrivateKey)) {
    return new GitHub(
      siteConfig.appId,
      readFileSync(siteConfig.githubPrivateKey).toString()
    );
  } else {
    return null;
  }
}

export class GitHub {
  private readonly globalApp: Octokit;
  private readonly privateKey: string;
  private readonly appId: number;

  constructor(appId: number, privateKey: string) {
    this.privateKey = privateKey;
    this.appId = appId;

    this.globalApp = new Octokit({
      authStrategy: createAppAuth,
      auth: {
        type: 'app',
        appId: appId,
        privateKey: privateKey
      }
    });
  }

  private async getRepoAuthorization(
    owner: string,
    repo: string
  ): Promise<Octokit> {
    const install = await this.globalApp.apps.getRepoInstallation({
      owner,
      repo
    });

    const repoAppInstall = new Octokit({
      authStrategy: createAppAuth,
      auth: {
        type: 'install',
        appId: this.appId,
        privateKey: this.privateKey,
        installationId: install.data.id
      }
    });

    return repoAppInstall;
  }

  public async postCommitComment(
    owner: string,
    repo: string,
    commitSha: string,
    message: string
  ): Promise<boolean> {
    const repoAppInstall = await this.getRepoAuthorization(owner, repo);

    const request = {
      owner: owner,
      repo: repo,
      commit_sha: commitSha,
      body: message
    };
    const result = await repoAppInstall.repos.createCommitComment(request);
    if (result.status !== 201) {
      log.error('GitHub request failed. (details above in log)', request);
    }
    return result.status === 201; // HTTP 201 Created
  }

  public getOwnerRepoFromUrl(url: string | undefined): Repo | null {
    if (url === undefined) {
      return null;
    }

    const githubRepo = /github\.com[:/]([A-Za-z0-9_.-]+)[/]([A-Za-z0-9_.-]+)/;
    const match = url.match(githubRepo);
    if (!match) {
      return null;
    } else {
      return {
        owner: match[1],
        repo: match[2]
      };
    }
  }
}

const github = createGitHubClient(siteConfig);
if (github === null) {
  log.info(
    'Reporting to GitHub is not yet enabled.' +
      ' Make sure GITHUB_APP_ID and GITHUB_PK are set to enable it.'
  );
}
