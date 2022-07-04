import { Octokit } from '@octokit/rest';
import { createAppAuth } from '@octokit/auth-app';
import { existsSync, readFileSync } from 'fs';

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

    const result = await repoAppInstall.repos.createCommitComment({
      owner: owner,
      repo: repo,
      commit_sha: commitSha,
      body: message
    });
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
