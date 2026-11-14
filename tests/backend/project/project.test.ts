import { describe, expect, it, jest } from '@jest/globals';
import { ParameterizedContext } from 'koa';
import { initJestMatchers } from '../../helpers.js';
import { Project } from '../../../src/backend/db/types.js';
import { prepareTemplate } from '../../../src/backend/templates.js';
import { robustPath } from '../../../src/backend/util.js';
import { renderDataExport } from '../../../src/backend/project/project.js';
import { Database } from '../../../src/backend/db/db.js';

initJestMatchers();

describe('renderProjectDataPage', () => {
  it('should render the page', () => {
    const project: Project = {
      id: 1,
      name: 'Test Project',
      slug: 'test-project',
      description: 'desc',
      logo: 'logo.png',
      showchanges: true,
      allresults: true,
      githubnotification: false,
      basebranch: 'base'
    };

    const tpl = prepareTemplate(
      robustPath('backend/project/project-data.html'),
      true
    );
    const html = tpl({ project, rebenchVersion: 'testVersion' });
    expect(html).toEqualHtmlFragment('project/project-data');
  });
});

describe('renderDataExport', () => {
  it('should render the page', () => {
    const data = {
      project: 'Test Project',
      expName: 'Test Experiment',
      preparingData: true,
      currentTime: 'Some Date',
      generationFailed: true,
      rebenchVersion: 'testVersion'
    };
    const tpl = prepareTemplate(
      robustPath('backend/project/get-exp-data.html'),
      true
    );
    const html = tpl(data);
    expect(html).toEqualHtmlFragment('project/get-exp-data');
  });
});

describe('renderDataExport request handling', () => {
  function createCtx(
    expIdAndExtension: string,
    headers: Record<string, string> = {}
  ): ParameterizedContext {
    return {
      params: { projectSlug: 'test-project', expIdAndExtension },
      header: headers,
      headers,
      set: jest.fn(),
      redirect: jest.fn()
    } as any;
  }

  function createDb() {
    // mimic PostgreSQL, which rejects non-integer ids
    const getExperimentDetails = jest.fn(async (expId: number) => {
      if (!Number.isInteger(expId)) {
        throw new Error(
          `invalid input syntax for type integer: "${String(expId)}"`
        );
      }
      return null;
    });
    const db = {
      getExperimentDetails,
      getExperimentMeasurements: jest.fn(async () => []),
      storeExperimentMeasurements: jest.fn(async () => [])
    } as unknown as Database;
    return { db, getExperimentDetails };
  }

  it.each([
    'abc',
    '123.csv',
    '123.json',
    '123.CSV.GZ',
    '12.5.csv.gz',
    '.json.gz',
    '1e3.json.gz',
    '123.txt.gz'
  ])('should respond with 404 for %p without querying the db', async (p) => {
    const ctx = createCtx(p);
    const { db, getExperimentDetails } = createDb();

    await renderDataExport(ctx, db);

    expect(ctx.status).toEqual(404);
    expect(getExperimentDetails).not.toHaveBeenCalled();
  });

  it.each<Record<string, string>>([
    { purpose: 'prefetch' },
    { 'x-purpose': 'preview' },
    { 'x-moz': 'prefetch' }
  ])(
    'should respond with 425 to prefetch requests with %p',
    async (headers) => {
      const ctx = createCtx('123.json.gz', headers);
      const { db, getExperimentDetails } = createDb();

      await renderDataExport(ctx, db);

      expect(ctx.status).toEqual(425);
      expect(getExperimentDetails).not.toHaveBeenCalled();
    }
  );
});
