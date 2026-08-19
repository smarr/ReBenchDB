import { describe, expect, beforeAll, afterAll, it } from '@jest/globals';
import nock, { Scope } from 'nock';
import pipeline1 from './pipelines-1.json' with { type: 'json' };
import runner1 from './runners-1.json' with { type: 'json' };
import {
  activePipelineFirstComparator,
  fetchPipelines,
  fetchPipelinesUncached,
  fetchRunners,
  fetchRunnersUncached,
  getJobStats,
  getRunnerStats,
  renderRunnerStatusFromData
} from '../../../src/backend/gitlab/runner-status.js';
import { Pipeline, Runner } from '../../../src/backend/gitlab/graphql-api.js';
import { initJestMatchers } from '../../helpers.js';
import { GraphQLClient } from 'graphql-request';
import { RequestCache } from '../../../src/backend/gitlab/request-cache.js';

initJestMatchers();

function createGraphQLClient(): GraphQLClient {
  return new GraphQLClient('https://example/api/graphql', {
    headers: {
      Authorization: `Bearer token`
    }
  });
}

describe('Test fetchRunnersUncached()', () => {
  describe('with pending jobs', () => {
    let scope: Scope;
    let runners: Map<string, Runner>;

    beforeAll(async () => {
      scope = nock('https://example')
        .matchHeader('content-type', 'application/json')
        .post('/api/graphql')
        .reply(200, runner1);
      runners = await fetchRunnersUncached(
        createGraphQLClient(),
        'SSW',
        new Date('2024-06-19T18:51:08.258Z')
      );
    });

    it('should return the correct number of runners', async () => {
      expect(runners.size).toBe(7);
    });

    it('should give the expected stats', async () => {
      const stats = getRunnerStats(runners);
      expect(stats).toEqual({
        'Total Runners': 7,
        Online: 7,
        Offline: 0,
        Paused: 0
      });
    });

    afterAll(() => {
      scope.done();
    });
  });

  it('should return empty list when group is missing', async () => {
    const scope = nock('https://example')
      .matchHeader('content-type', 'application/json')
      .post('/api/graphql')
      .reply(200, { data: { group: null } });

    const runners = await fetchRunnersUncached(
      createGraphQLClient(),
      'SSW',
      new Date('2024-06-19T18:51:08.258Z')
    );

    expect(runners.size).toEqual(0);
    scope.done();
  });

  it('should fetch all runner pages', async () => {
    const firstPage = {
      data: {
        group: {
          runners: {
            pageInfo: {
              hasNextPage: true,
              endCursor: 'cursor-1'
            },
            nodes: [
              {
                id: 'runner-1',
                description: 'first',
                active: true,
                paused: false,
                status: 'online',
                tagList: [],
                architectureName: 'x64',
                platformName: 'linux',
                version: '17.0',
                revision: 'abc',
                contactedAt: '2024-01-01T00:00:00Z',
                maximumTimeout: 3600,
                accessLevel: 'not_protected'
              }
            ]
          }
        }
      }
    };

    const secondPage = {
      data: {
        group: {
          runners: {
            pageInfo: {
              hasNextPage: false,
              endCursor: null
            },
            nodes: [
              {
                id: 'runner-2',
                description: 'second',
                active: false,
                paused: false,
                status: 'offline',
                tagList: [],
                architectureName: 'x64',
                platformName: 'linux',
                version: '17.0',
                revision: 'def',
                contactedAt: '2024-01-01T00:01:00Z',
                maximumTimeout: 3600,
                accessLevel: 'not_protected'
              }
            ]
          }
        }
      }
    };

    const scope = nock('https://example')
      .matchHeader('content-type', 'application/json')
      .post('/api/graphql')
      .reply(200, firstPage)
      .post('/api/graphql')
      .reply(200, secondPage);

    const runners = await fetchRunnersUncached(
      createGraphQLClient(),
      'SSW',
      new Date('2024-06-19T18:51:08.258Z')
    );

    expect(runners.size).toBe(2);
    expect(scope.isDone()).toBe(true);
  });

  it('should return empty list when runner container is missing', async () => {
    const scope = nock('https://example')
      .matchHeader('content-type', 'application/json')
      .post('/api/graphql')
      .reply(200, { data: { group: { runners: null } } });

    const runners = await fetchRunnersUncached(
      createGraphQLClient(),
      'SSW',
      new Date('2024-06-19T18:51:08.258Z')
    );

    expect(runners.size).toBe(0);
    scope.done();
  });
});

describe('Test fetchPipelinesUncached()', () => {
  describe('with pending jobs', () => {
    let scope: Scope;
    let pipelines: Pipeline[];

    beforeAll(async () => {
      scope = nock('https://example')
        .matchHeader('content-type', 'application/json')
        .post('/api/graphql')
        .reply(200, pipeline1);
      pipelines = await fetchPipelinesUncached(
        createGraphQLClient(),
        'SSW',
        new Date('2024-06-19T18:51:08.258Z')
      );
    });

    it('should return the correct number of pipelines', async () => {
      expect(pipelines).toHaveLength(45);
    });

    it('should have the expected number of jobs in total', async () => {
      const totalJobs = pipelines.reduce(
        (acc, pipeline) => acc + pipeline.jobs.nodes.length,
        0
      );
      expect(totalJobs).toBe(292);
    });

    it('should make sure pipelines have a project reference', async () => {
      for (const pipeline of pipelines) {
        expect(pipeline.project).toBeDefined();
        expect(pipeline.project?.name).toBeDefined();
      }
    });

    it('should make sure jobs have a pipeline reference', async () => {
      for (const pipeline of pipelines) {
        for (const job of pipeline.jobs.nodes) {
          expect(job.pipeline).toBeDefined();
          expect(job.pipeline?.id).toBe(pipeline.id);
          expect(job.pipeline).toBe(pipeline);
        }
      }
    });

    it('should give the expected job stats', async () => {
      const stats = getJobStats(pipelines);
      expect(stats).toEqual({
        'All Jobs': 292,
        Canceled: 43,
        Created: 6,
        Failed: 67,
        Pending: 22,
        Running: 6,
        Skipped: 7,
        Success: 141
      });
    });

    afterAll(() => {
      scope.done();
    });
  });

  it('should return empty list when group is missing', async () => {
    const scope = nock('https://example')
      .matchHeader('content-type', 'application/json')
      .post('/api/graphql')
      .reply(200, { data: { group: null } });

    const pipelines = await fetchPipelinesUncached(
      createGraphQLClient(),
      'SSW',
      new Date('2024-06-19T18:51:08.258Z')
    );

    expect(pipelines).toEqual([]);
    scope.done();
  });

  it('should fetch all project pages for pipelines', async () => {
    const firstPage = {
      data: {
        group: {
          projects: {
            pageInfo: {
              hasNextPage: true,
              endCursor: 'cursor-1'
            },
            nodes: [
              {
                name: 'Proj A',
                fullPath: 'group/proj-a',
                webUrl: 'https://example/group/proj-a',
                pipelines: {
                  nodes: [
                    {
                      id: 'gid://gitlab/Ci::Pipeline/100',
                      iid: '100',
                      commit: {
                        sha: 'aaa',
                        message: 'msg',
                        authorEmail: 'a@example.com',
                        authorName: 'A'
                      },
                      status: 'SUCCESS',
                      ref: 'main',
                      createdAt: '2024-01-01T00:00:00Z',
                      startedAt: '2024-01-01T00:00:10Z',
                      finishedAt: '2024-01-01T00:01:00Z',
                      user: {
                        name: 'A',
                        username: 'a'
                      },
                      jobs: {
                        nodes: [
                          {
                            id: 'job-100',
                            name: 'build',
                            status: 'SUCCESS',
                            createdAt: '2024-01-01T00:00:10Z',
                            startedAt: '2024-01-01T00:00:20Z',
                            finishedAt: '2024-01-01T00:00:50Z',
                            queuedDuration: 1,
                            stage: { name: 'build' },
                            tags: [],
                            runner: { id: 'runner-1' },
                            webPath: '/group/proj-a/-/jobs/100'
                          }
                        ]
                      }
                    }
                  ]
                }
              }
            ]
          }
        }
      }
    };

    const secondPage = {
      data: {
        group: {
          projects: {
            pageInfo: {
              hasNextPage: false,
              endCursor: null
            },
            nodes: [
              {
                name: 'Proj B',
                fullPath: 'group/proj-b',
                webUrl: 'https://example/group/proj-b',
                pipelines: {
                  nodes: [
                    {
                      id: 'gid://gitlab/Ci::Pipeline/101',
                      iid: '101',
                      commit: {
                        sha: 'bbb',
                        message: 'msg',
                        authorEmail: 'b@example.com',
                        authorName: 'B'
                      },
                      status: 'RUNNING',
                      ref: 'main',
                      createdAt: '2024-01-01T00:10:00Z',
                      startedAt: '2024-01-01T00:10:10Z',
                      finishedAt: null,
                      user: {
                        name: 'B',
                        username: 'b'
                      },
                      jobs: {
                        nodes: [
                          {
                            id: 'job-101',
                            name: 'test',
                            status: 'RUNNING',
                            createdAt: '2024-01-01T00:10:10Z',
                            startedAt: '2024-01-01T00:10:20Z',
                            finishedAt: null,
                            queuedDuration: 1,
                            stage: { name: 'test' },
                            tags: [],
                            runner: { id: 'runner-2' },
                            webPath: '/group/proj-b/-/jobs/101'
                          }
                        ]
                      }
                    }
                  ]
                }
              }
            ]
          }
        }
      }
    };

    const scope = nock('https://example')
      .matchHeader('content-type', 'application/json')
      .post('/api/graphql')
      .reply(200, firstPage)
      .post('/api/graphql')
      .reply(200, secondPage);

    const pipelines = await fetchPipelinesUncached(
      createGraphQLClient(),
      'SSW',
      new Date('2024-06-19T18:51:08.258Z')
    );

    expect(pipelines).toHaveLength(2);
    expect(scope.isDone()).toBe(true);
  });

  it('should return empty list when projects is null', async () => {
    const scope = nock('https://example')
      .matchHeader('content-type', 'application/json')
      .post('/api/graphql')
      .reply(200, { data: { group: { projects: null } } });

    const pipelines = await fetchPipelinesUncached(
      createGraphQLClient(),
      'SSW',
      new Date('2024-06-19T18:51:08.258Z')
    );

    expect(pipelines).toEqual([]);
    scope.done();
  });
});

describe('render runner status', () => {
  describe('with pending jobs', () => {
    let scope: Scope;
    let pipelines: Pipeline[];
    let runners: Map<string, Runner>;

    beforeAll(async () => {
      scope = nock('https://example')
        .matchHeader('content-type', 'application/json')
        .post('/api/graphql')
        .reply(200, pipeline1)
        .post('/api/graphql')
        .reply(200, runner1);
      pipelines = await fetchPipelinesUncached(
        createGraphQLClient(),
        'SSW',
        new Date('2024-06-19T18:51:08.258Z')
      );
      runners = await fetchRunnersUncached(
        createGraphQLClient(),
        'SSW',
        new Date('2024-06-19T18:51:08.258Z')
      );
    });

    it('should render the runner status page to a string', async () => {
      const result = renderRunnerStatusFromData(
        pipelines,
        runners,
        new Date('2026-06-19T18:51:08.258Z'),
        'Test Project'
      );
      expect(result).toEqualHtmlFragment('gitlab-runner/runner-with-pending');
    });

    afterAll(() => {
      scope.done();
    });
  });
});

describe('GitLab request cache', () => {
  it('should reuse cached runner and pipeline requests', async () => {
    const scope = nock('https://example')
      .matchHeader('content-type', 'application/json')
      .post('/api/graphql')
      .reply(200, pipeline1)
      .post('/api/graphql')
      .reply(200, runner1);

    const runnerCache = new RequestCache<Map<string, Runner>>(
      250,
      fetchRunnersUncached,
      createGraphQLClient()
    );

    const pipelinesCache = new RequestCache<Pipeline[]>(
      250,
      fetchPipelinesUncached,
      createGraphQLClient()
    );

    const firstPipelines = await fetchPipelines(
      pipelinesCache,
      'SSW',
      new Date('2024-06-19T18:51:08.258Z')
    );
    const secondPipelines = await fetchPipelines(
      pipelinesCache,
      'SSW',
      new Date('2024-06-19T18:51:08.258Z')
    );

    const firstRunners = await fetchRunners(
      runnerCache,
      'SSW',
      new Date('2024-06-19T18:51:08.258Z')
    );
    const secondRunners = await fetchRunners(
      runnerCache,
      'SSW',
      new Date('2024-06-19T18:51:08.258Z')
    );

    expect(secondPipelines).toBe(firstPipelines);
    expect(secondRunners).toBe(firstRunners);
    expect(scope.isDone()).toBe(true);
  });
});

describe('activePipelineFirstComparator', () => {
  it('should use startedAt and createdAt when finishedAt is missing', () => {
    const pipelineA = {
      id: '1',
      createdAt: '2024-01-01T00:00:00Z',
      startedAt: '2024-01-01T00:01:00Z',
      hasActiveJobs: false
    } as Pipeline;
    const pipelineB = {
      id: '2',
      createdAt: '2024-01-01T00:02:00Z',
      hasActiveJobs: false
    } as Pipeline;

    expect(activePipelineFirstComparator(pipelineA, pipelineB)).toBe(60000);
    expect(activePipelineFirstComparator(pipelineB, pipelineA)).toBe(-60000);
  });

  it('should sort pipelines with active jobs first', () => {
    const pipelineA = {
      id: '1',
      createdAt: '2024-01-01T00:00:00Z',
      startedAt: '2024-01-01T00:01:00Z',
      finishedAt: '2024-01-01T00:02:00Z',
      hasActiveJobs: true
    } as Pipeline;
    const pipelineB = {
      id: '2',
      createdAt: '2024-01-01T00:00:00Z',
      startedAt: '2024-01-01T00:01:00Z',
      finishedAt: '2024-01-01T00:02:00Z',
      hasActiveJobs: false
    } as Pipeline;

    expect(activePipelineFirstComparator(pipelineA, pipelineB)).toBe(-1);
    expect(activePipelineFirstComparator(pipelineB, pipelineA)).toBe(1);
  });

  it(
    'should sort pipelines' +
      ' with the same active job status by creation date',
    () => {
      const pipelineA = {
        id: '1',
        createdAt: '2024-01-01T00:00:00Z',
        startedAt: '2024-01-01T00:01:00Z',
        finishedAt: '2024-01-01T00:02:00Z',
        hasActiveJobs: false
      } as Pipeline;
      const pipelineB = {
        id: '2',
        createdAt: '2024-01-02T00:00:00Z',
        startedAt: '2024-01-02T00:01:00Z',
        finishedAt: '2024-01-02T00:02:00Z',
        hasActiveJobs: false
      } as Pipeline;

      expect(activePipelineFirstComparator(pipelineA, pipelineB)).toBe(
        86400000
      );
      expect(activePipelineFirstComparator(pipelineB, pipelineA)).toBe(
        -86400000
      );
    }
  );

  it(
    'should consider pipelines' +
      ' with the same active job status and creation date as equal',
    () => {
      const pipelineA = {
        id: '1',
        createdAt: '2024-01-01T00:00:00Z',
        startedAt: '2024-01-01T00:01:00Z',
        finishedAt: '2024-01-01T00:02:00Z',
        hasActiveJobs: false
      } as Pipeline;
      const pipelineB = {
        id: '2',
        createdAt: '2024-01-01T00:00:00Z',
        startedAt: '2024-01-01T00:01:00Z',
        finishedAt: '2024-01-01T00:02:00Z',
        hasActiveJobs: false
      } as Pipeline;

      expect(activePipelineFirstComparator(pipelineA, pipelineB)).toBe(0);
      expect(activePipelineFirstComparator(pipelineB, pipelineA)).toBe(0);
    }
  );
});
