import type {
  ChangesResponse,
  ProfileRow,
  SiteStatsResponse,
  WarmupDataForTrial
} from './view-types.js';

import type { Source as DbSource } from '../backend/db/types.js';
import type { AllResults, TimelineResponse } from './api.js';

export const apiRoutes = {
  '/:projectSlug/source/:sourceId': {
    method: 'GET',
    response: undefined as unknown as DbSource | string
  },
  '/rebenchdb/dash/:projectId/results': {
    method: 'GET',
    response: undefined as unknown as AllResults[]
  },
  '/rebenchdb/dash/:projectId/timeline/:runId': {
    method: 'GET',
    response: undefined as unknown as TimelineResponse | null
  },
  '/rebenchdb/dash/:projectSlug/profiles/:runId/:commitId': {
    method: 'GET',
    response: undefined as unknown as ProfileRow[]
  },
  '/rebenchdb/dash/:projectSlug/measurements/:runId/:baseId/:changeId': {
    method: 'GET',
    response: undefined as unknown as WarmupDataForTrial[] | null
  },

  '/rebenchdb/stats': {
    method: 'GET',
    response: undefined as unknown as SiteStatsResponse
  },
  '/rebenchdb/dash/:projectId/changes': {
    method: 'GET',
    response: undefined as unknown as ChangesResponse
  },
  '/rebenchdb/dash/:projectId/data-overview': {
    method: 'GET',
    response: undefined as unknown as { data: any[] }
  },
  '/rebenchdb/dash/:projectName/timelines': {
    method: 'POST',
    response: undefined as unknown as TimelineResponse
  }
} as const;

interface ApiRoute {
  method: 'GET' | 'POST';
  response: unknown;
}

type Routes = Record<string, ApiRoute>;

const _typeCheckApiRoutes: Routes = apiRoutes;

export type ApiRoutes = typeof apiRoutes;
