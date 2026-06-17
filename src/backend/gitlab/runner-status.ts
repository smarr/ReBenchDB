import { ClientError, gql, GraphQLClient } from 'graphql-request';
import {
  Job,
  Pipeline,
  Project,
  ProjectsResponse,
  Runner,
  RunnersResponse
} from './graphql-api.js';
import { prepareTemplate } from '../templates.js';
import { rebenchVersion, robustPath, siteConfig } from '../util.js';
import * as dataFormatters from '../../shared/data-format.js';
import * as viewHelpers from '../../shared/helpers.js';
import { ParameterizedContext } from 'koa';
import { Database } from '../db/db.js';
import { respondProjectNotFound } from '../common/standard-responses.js';
import { log } from '../logging.js';

const QUERY_GROUP_RUNNERS = gql`
  query ($groupPath: ID!, $after: String) {
    group(fullPath: $groupPath) {
      id
      name
      fullPath
      runners(first: 100, after: $after) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          id
          description
          active
          paused
          status
          tagList
          architectureName
          platformName
          version
          revision
          contactedAt
          maximumTimeout
          accessLevel
        }
      }
    }
  }
`;

const QUERY_PIPELINES_AND_JOBS = gql`
  query ($groupPath: ID!, $updatedAfter: Time, $after: String) {
    group(fullPath: $groupPath) {
      projects(first: 100, includeSubgroups: true, after: $after) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          name
          fullPath
          webUrl
          pipelines(first: 20, updatedAfter: $updatedAfter) {
            nodes {
              id
              iid
              commit {
                sha
                message
                authorEmail
                authorName
              }
              status
              ref
              createdAt
              startedAt
              finishedAt
              user {
                name
                username
              }
              jobs(first: 100) {
                nodes {
                  id
                  name
                  status
                  createdAt
                  startedAt
                  finishedAt
                  queuedDuration
                  stage {
                    name
                  }
                  tags
                  runner {
                    id
                  }
                  webPath
                }
              }
            }
          }
        }
      }
    }
  }
`;

const JOB_STATUS_ORDER = [
  'RUNNING',
  'PENDING',
  'CREATED',
  'SKIPPED',
  'CANCELED',
  'FAILED',
  'SUCCESS'
];

function jobStatusPriority(status: string): number {
  const normalized = status.toUpperCase();
  const index = JOB_STATUS_ORDER.indexOf(normalized);
  return index === -1 ? JOB_STATUS_ORDER.length : index;
}

function mostInterestingJobsFirstComparator(a: Job, b: Job): number {
  const aPriority = jobStatusPriority(a.status);
  const bPriority = jobStatusPriority(b.status);

  if (aPriority !== bPriority) {
    return aPriority - bPriority;
  }

  const aDate = new Date(a.startedAt || a.createdAt);
  const bDate = new Date(b.startedAt || b.createdAt);
  return bDate.getTime() - aDate.getTime();
}

function getHighPrioDate(p: Pipeline): string {
  if (p.finishedAt) {
    return p.finishedAt;
  }
  if (p.startedAt) {
    return p.startedAt;
  }
  return p.createdAt;
}

export function activePipelineFirstComparator(
  a: Pipeline,
  b: Pipeline
): number {
  if (a.hasActiveJobs && !b.hasActiveJobs) {
    return -1;
  }
  if (!a.hasActiveJobs && b.hasActiveJobs) {
    return 1;
  }

  const aTime = new Date(getHighPrioDate(a)).getTime();
  const bTime = new Date(getHighPrioDate(b)).getTime();
  return bTime - aTime;
}

async function fetchPipelinesAndJobsPerProject(
  client: GraphQLClient,
  groupPath: string,
  updatedAfter?: Date
): Promise<Project[]> {
  const projects: Project[] = [];
  let after: string | null = null;

  while (true) {
    const data: ProjectsResponse = await client.request<ProjectsResponse>(
      QUERY_PIPELINES_AND_JOBS,
      {
        groupPath,
        updatedAfter: updatedAfter && updatedAfter.toISOString(),
        after
      }
    );

    if (!data.group) {
      log.warn(
        'GitLab API: Received empty GraphQL response.' +
          ' Perhaps access token in GITLAB_TOKEN is invalid?'
      );
      return projects;
    }
    const ps = data.group.projects;
    if (!ps || !ps.nodes) {
      return projects;
    }

    projects.push(...ps.nodes);

    if (!ps.pageInfo.hasNextPage) {
      return projects;
    }

    after = ps.pageInfo.endCursor;
  }
}

export async function fetchRunners(
  client: GraphQLClient,
  groupPath: string,
  updatedAfter?: Date
): Promise<Runner[]> {
  // TODO reuse GraphQLClient instance
  log.warn(
    `fetchRunners() for group ${groupPath} with updatedAfter ${updatedAfter}`
  );

  const runners: Runner[] = [];
  let after: string | null = null;
  while (true) {
    const data: RunnersResponse = await client.request<RunnersResponse>(
      QUERY_GROUP_RUNNERS,
      {
        groupPath,
        updatedAfter: updatedAfter && updatedAfter.toISOString(),
        after
      }
    );

    if (!data.group) {
      log.warn(
        'GitLab API: Received empty GraphQL response.' +
          ' Perhaps access token in GITLAB_TOKEN is invalid?'
      );
      return runners;
    }

    const rs = data.group.runners;
    if (!rs || !rs.nodes) {
      return runners;
    }

    runners.push(...rs.nodes);

    if (!rs.pageInfo.hasNextPage) {
      return runners;
    }

    after = rs.pageInfo.endCursor;
  }
}

export async function fetchPipelines(
  client: GraphQLClient,
  groupPath: string,
  updatedAfter?: Date
): Promise<Pipeline[]> {
  log.warn(
    `fetchPipelines() for group ${groupPath} with updatedAfter ${updatedAfter}`
  );

  const projects = await fetchPipelinesAndJobsPerProject(
    client,
    groupPath,
    updatedAfter
  );
  const result: Pipeline[] = [];

  for (const project of projects) {
    const pipelines = project.pipelines.nodes;
    for (const pipeline of pipelines) {
      result.push(pipeline);
      pipeline.project = project;
      pipeline.pipelineId = parseInt(pipeline.id.split('/').pop() || '', 10);

      for (const job of pipeline.jobs.nodes) {
        job.pipeline = pipeline;
        if (isJobActive(job)) {
          pipeline.hasActiveJobs = true;
        }
      }

      pipeline.jobs.nodes.sort(mostInterestingJobsFirstComparator);
    }
  }

  result.sort(activePipelineFirstComparator);

  return result;
}

const runnerPageTpl = prepareTemplate(
  robustPath('backend/gitlab/html/index.html'),
  false,
  robustPath('backend/gitlab/html')
);

function isJobActive(job: Job) {
  return (
    job.status == 'RUNNING' ||
    job.status == 'PENDING' ||
    job.status == 'CREATED'
  );
}

export function createGraphQLClient(): GraphQLClient {
  return new GraphQLClient(siteConfig.gitlabConfig.apiUrl, {
    headers: {
      Authorization: `Bearer ${siteConfig.gitlabConfig.token}`
    }
  });
}

export async function renderRunnerStatusToString(
  projectName: string
): Promise<string> {
  const client = createGraphQLClient();
  const pipelines = await fetchPipelines(
    client,
    siteConfig.gitlabConfig.group,
    new Date(Date.now() - siteConfig.gitlabConfig.updatedAfterSeconds * 1000)
  );
  const runners = await fetchRunners(client, siteConfig.gitlabConfig.group);
  return renderRunnerStatusFromData(
    pipelines,
    runners,
    new Date(),
    projectName
  );
}

export function getJobStats(pipelines: Pipeline[]): Record<string, number> {
  const result: Record<string, number> = {};
  result['All Jobs'] = 0;

  for (const pipeline of pipelines) {
    for (const job of pipeline.jobs.nodes) {
      result['All Jobs'] += 1;
      let status = job.status.toLowerCase();
      status = status.charAt(0).toUpperCase() + status.slice(1);
      if (result[status] !== undefined) {
        result[status] += 1;
      } else {
        result[status] = 1;
      }
    }
  }

  return result;
}

export function getRunnerStats(runners: Runner[]): Record<string, number> {
  let online = 0;
  let offline = 0;
  let paused = 0;

  for (const runner of runners) {
    if (runner.active) {
      if (runner.paused) {
        paused++;
      } else {
        online++;
      }
    } else {
      offline++;
    }
  }

  return {
    'Total Runners': runners.length,
    Online: online,
    Offline: offline,
    Paused: paused
  };
}

export function renderRunnerStatusFromData(
  pipelines: Pipeline[],
  runners: Runner[],
  renderStartTime: Date,
  projectName: string
): string {
  return runnerPageTpl({
    gitlabSiteUrl: siteConfig.gitlabConfig.siteUrl,
    gitlabGroup: siteConfig.gitlabConfig.group,
    project: projectName,
    pipelines,
    runners,
    rebenchVersion,
    runnerStatusStats: getRunnerStats(runners),
    jobStatusStats: getJobStats(pipelines),
    dataFormatters,
    viewHelpers,
    renderStartTime
  });
}

export async function renderRunners(
  ctx: ParameterizedContext,
  db: Database
): Promise<void> {
  const project = await db.getProjectBySlug(ctx.params.projectSlug);

  if (project) {
    try {
      ctx.body = await renderRunnerStatusToString(project.name);
      ctx.type = 'html';
    } catch (e) {
      if (e instanceof ClientError) {
        log.error('Error fetching runner status from GitLab API', {
          error: e,
          response: e.response,
          request: e.request
        });
      } else {
        log.error('Unexpected error rendering runner status', { error: e });
      }
      ctx.status = 500;
    }
  } else {
    respondProjectNotFound(ctx, ctx.params.projectSlug);
  }
}
