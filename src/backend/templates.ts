import { readFileSync } from 'fs';
import { robustPath } from './util.js';
import { compile, TemplateFunction, Options } from 'ejs';

const ejsConfig: Options = {
  openDelimiter: '{',
  closeDelimiter: '}',
  root: robustPath('views'),
  views: [robustPath('views')],
  _with: false,
  strict: true,
  localsName: 'it'
};

export function prepareTemplate(
  filename: string,
  rmWhitespace = false,
  templateRoot: string | undefined = undefined
): TemplateFunction {
  const fileContent = readFileSync(filename).toString();
  const config = { ...ejsConfig, rmWhitespace };

  if (templateRoot) {
    config.root = templateRoot;
    config.views?.push(templateRoot);
  }
  return <TemplateFunction>compile(fileContent, config);
}
