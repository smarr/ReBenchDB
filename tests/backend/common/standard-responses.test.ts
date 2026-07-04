import { describe, expect, it } from '@jest/globals';
import {
  respondProjectAndSourceNotFound,
  respondProjectNotFound
} from '../../../src/backend/common/standard-responses.js';

describe('respondProjectNotFound', () => {
  it('should set status to 404 and respond with text', () => {
    const response: any = {};
    respondProjectNotFound(response, 'project-slug');
    expect(response.status).toEqual(404);
    expect(response.type).toEqual('text');
  });
});

describe('respondProjectAndSourceNotFound', () => {
  it('should set status to 404 and respond with text', () => {
    const response: any = {};
    respondProjectAndSourceNotFound(response, 'project-slug', 'sha-commit-id');
    expect(response.status).toEqual(404);
    expect(response.type).toEqual('text');
  });
});
