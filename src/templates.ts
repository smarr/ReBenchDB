import { readFileSync } from 'fs';
import m from 'mustache';
import { robustPath } from './util.js';
import { compile, TemplateFunction, Options } from 'ejs';

const headerHtml = readFileSync(robustPath('views/header.html')).toString();

export function processTemplate(filename: string, variables: any = {}): string {
  const fileContent = readFileSync(robustPath(`views/${filename}`)).toString();

  variables.headerHtml = headerHtml;
  return m.render(fileContent, variables);
}

const ejsConfig: Options = {
  openDelimiter: '{',
  closeDelimiter: '}',
  root: robustPath('views'),
  views: [robustPath('views')],
  _with: false,
  strict: true,
  localsName: 'it'
};

export function prepareTemplate(filename: string): TemplateFunction {
  const fileContent = readFileSync(robustPath(`views/${filename}`)).toString();
  return <TemplateFunction>compile(fileContent, ejsConfig);
}
