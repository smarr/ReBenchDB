import { readFileSync } from 'fs';
import { render } from 'mustache';
import { robustPath } from './util';

const headerHtml = readFileSync(robustPath('views/header.html')).toString();

export function processTemplate(filename: string, variables: any = {}): string {
  const fileContent = readFileSync(robustPath(`views/${filename}`)).toString();

  variables.headerHtml = headerHtml;
  return render(fileContent, variables);
}
