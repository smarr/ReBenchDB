import { readFileSync } from 'fs';
import { render } from 'mustache';

const headerHtml = readFileSync(`${__dirname}/../../src/views/header.html`).toString();

export function processTemplate(filename: string, variables: any = {}): string {
  const fileContent = readFileSync(`${__dirname}/../../src/views/${filename}`).toString();

  variables.headerHtml = headerHtml;
  return render(fileContent, variables);
}
