import { describe, expect, it } from '@jest/globals';
import { initJestMatchers } from '../../helpers.js';
import { ProjectWithNamespace } from '../../../src/backend/db/types.js';
import { prepareTemplate } from '../../../src/backend/templates.js';
import { robustPath } from '../../../src/backend/util.js';

initJestMatchers();

describe('renderProjectDataPage', () => {
  it('should render the page', () => {
    const project: ProjectWithNamespace = {
      id: 1,
      name: 'Test Project',
      slug: 'test-project',
      description: 'desc',
      logo: 'logo.png',
      showchanges: true,
      allresults: true,
      githubnotification: false,
      basebranch: 'base',
      namespaceid: 1,
      namespacename: 'legacy'
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
