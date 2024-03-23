import { describe, expect, it } from '@jest/globals';
import {
  respondExpIdNotFound,
  respondProjectAndSourceNotFound,
  respondProjectIdNotFound,
  respondProjectNotFound
} from '../../../src/backend/common/standard-responses.js';

describe('respondProjectIdNotFound', () => {
  it('should set status to 404 and respond with text', () => {
    const response: any = {};
    respondProjectIdNotFound(response, 42);
    expect(response.status).toEqual(404);
    expect(response.type).toEqual('text');
  });
});

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

describe('respondExpIdNotFound', () => {
  it('should set status to 404 and respond with text', () => {
    const response: any = {};
    respondExpIdNotFound(response, 'exp-id');
    expect(response.status).toEqual(404);
    expect(response.type).toEqual('text');
  });
});
