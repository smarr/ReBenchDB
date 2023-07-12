import { describe, expect, it } from '@jest/globals';
import { initJestMatchers } from '../../helpers.js';
import { Project } from '../../../src/backend/db/types.js';
import { prepareTemplate } from '../../../src/backend/templates.js';
import { robustPath } from '../../../src/backend/util';

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
    const html = tpl({ project });
    expect(html).toEqualHtmlFragment('project/project-data');
  });
});
