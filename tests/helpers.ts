import { expect } from '@jest/globals';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, sep } from 'node:path';

import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

declare module 'expect' {
  interface AsymmetricMatchers {
    toBeMostlyIdenticalImage(outputFolder: string, expectedFile: string): void;
    toBeIdenticalSvgFiles(outputFolder: string, expectedFile: string): void;
  }
  interface Matchers<R> {
    toBeMostlyIdenticalImage(outputFolder: string, expectedFile: string): R;
    toBeIdenticalSvgFiles(outputFolder: string, expectedFile: string): R;
  }
}

export function createTmpDirectory(): string {
  const tmpDir = tmpdir();
  return mkdtempSync(`${tmpDir}${sep}rebenchdb-charts-tests`);
}

export function deleteTmpDirectory(outputFolder: string, keep: boolean): void {
  if (keep) {
    console.log(`outputFolder: ${outputFolder}`);
  } else {
    rmSync(outputFolder, { recursive: true, force: true });
  }
}

function toBeMostlyIdenticalImage(
  actualFile: string,
  outputFolder: string,
  expectedFile: string
) {
  if (typeof actualFile !== 'string' || typeof expectedFile !== 'string') {
    throw new Error(
      `toBeMostlyIdenticalImage() expects two strings,` +
        ` got ${typeof actualFile} and ${typeof expectedFile}`
    );
  }

  const actualPng = PNG.sync.read(
    readFileSync(`${outputFolder}/${actualFile}`)
  );
  const expectedPng = PNG.sync.read(readFileSync(expectedFile));

  const actualSize = { width: actualPng.width, height: actualPng.height };
  const expectedSize = {
    width: expectedPng.width,
    height: expectedPng.height
  };

  if (
    actualSize.width !== expectedSize.width ||
    actualSize.height !== expectedSize.height
  ) {
    return {
      message: () =>
        `expected ${actualFile} to have the same size as ${expectedFile}.
         Expected: ${actualSize.width}x${actualSize.height}
         Actual:   ${expectedSize.width}x${expectedSize.height}`,
      pass: false
    };
  }

  const diff = new PNG({
    width: actualSize.width,
    height: actualSize.height
  });

  const numMismatchedPixel = pixelmatch(
    expectedPng.data,
    actualPng.data,
    diff.data,
    actualSize.width,
    actualSize.height,
    { threshold: 0.01 }
  );

  if (numMismatchedPixel > 0) {
    const diffFileName = `diff-${basename(expectedFile)}-${basename(
      actualFile
    )}.png`;
    writeFileSync(diffFileName, PNG.sync.write(diff));

    return {
      message: () =>
        `expected ${actualFile} to be mostly identical to ${expectedFile},
         but ${numMismatchedPixel} pixels were different.
         See ${diffFileName} for a diff.`,
      pass: false
    };
  }

  return {
    pass: true,
    message: () =>
      `Expected ${actualFile} to be different ` +
      `from ${expectedFile}, but were mostly identical.`
  };
}

function toBeIdenticalSvgFiles(
  actualFile: string,
  outputFolder: string,
  expectedFile: string
) {
  const actual: string = readFileSync(`${outputFolder}/${actualFile}`, 'utf8');
  const expected: string = readFileSync(expectedFile, 'utf8');

  if (actual !== expected) {
    writeFileSync(basename(actualFile), actual);

    return {
      message: () =>
        `expected ${actualFile} to be identical to ${expectedFile},
         but they were different.
         See ${basename(actualFile)}.`,
      pass: false
    };
  }
  return {
    pass: true,
    message: () =>
      `Expected ${actualFile} to be different ` +
      `from ${expectedFile}, but both were identical.`
  };
}

export function initJestMatchers(): void {
  expect.extend({
    toBeMostlyIdenticalImage,
    toBeIdenticalSvgFiles
  });
}
