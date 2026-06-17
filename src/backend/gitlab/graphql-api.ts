interface LifecycleDates {
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
}

interface Commit {
  sha?: string;
  message?: string;
  authorEmail?: string;
  authorName?: string;
}

interface User {
  name?: string;
  username?: string;
}

interface PageInfo {
  hasNextPage: boolean;
  endCursor: string;
}

export interface Job extends LifecycleDates {
  id: string;
  name?: string;
  status: string;
  queuedDuration?: string | number;
  stage?: {
    name?: string;
  };
  tags?: string[];
  runner?: {
    id?: string;
  };
  webPath?: string;

  /* link to pipeline will be set when processing the data. */
  pipeline?: Pipeline;
}

export interface Pipeline extends LifecycleDates {
  /** id in the format of `gid://gitlab/Ci::Pipeline/10853` */
  id: string;
  /** Internal ID within the response. */
  iid?: string;
  commit?: Commit;
  status?: string;
  ref?: string;
  user?: User;
  jobs: { nodes: Job[] };

  /* link to project will be set when processing the data. */
  project?: Project;
  hasActiveJobs?: boolean;

  /** extracted numeric id from `id` */
  pipelineId?: number;
}

export interface Project {
  name?: string;
  fullPath?: string;
  webUrl?: string;
  pipelines: {
    nodes: Pipeline[];
    pageInfo?: PageInfo;
  };
}

export interface ProjectsResponse {
  group: {
    projects: {
      pageInfo: PageInfo;
      nodes: Project[];
    };
  } | null;
}

export interface RunnersResponse {
  group: {
    runners: {
      pageInfo: PageInfo;
      nodes: Runner[];
    };
  } | null;
}

export interface Runner {
  id: string;
  description: string;
  active: boolean;
  paused: boolean;
  status: string;
  tagList: string[];
  architectureName: string;
  platformName: string;
  version: string;
  revision: string;
  contactedAt: string;
  maximumTimeout: number | null;
  accessLevel: string;
}
