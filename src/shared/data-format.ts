import type { BenchmarkId } from '../shared/api.js';
import type { Environment } from '../backend/db/types.js';

/**
 * Round to 0 decimal places.
 */
export function r0(val: number): string {
  const result = val.toFixed(0);
  if (result === '-0') {
    return '0';
  }
  return result;
}

/**
 * Round to 2 decimal places.
 */
export function r2(val: number): string {
  const result = val.toFixed(2);
  if (result === '-0.00') {
    return '0.00';
  }
  return result;
}

/**
 * As percentage.
 */
export function per(val: number): string {
  return r0(val * 100);
}

/**
 * As memory value rounded to an appropriate unit.
 */
export function asHumanMem(val: number, digits = 0): string {
  if (isNaN(val)) {
    return '';
  }

  let m = val;
  const mem = ['b', 'kb', 'MB', 'GB'];
  let i = 0;
  while (i < 3 && m >= 1024) {
    m = m / 1024;
    i += 1;
  }

  return `${m.toFixed(digits)}${mem[i]}`;
}

/**
 * As frequency value rounded to an appropriate unit.
 */
export function asHumanHz(val: number, digits = 0): string {
  if (isNaN(val)) {
    return '';
  }

  let h = val;
  const hz = ['Hz', 'kHz', 'MHz', 'GHz'];
  let i = 0;
  while (i < 3 && h >= 1000) {
    h = h / 1000;
    i += 1;
  }

  return `${h.toFixed(digits)}${hz[i]}`;
}

/**
 * Return a string with the environment information for display.
 */
export function formatEnvironment(
  envId: number,
  environments: Environment[]
): string | undefined {
  const env = environments.find((e) => e.envid === envId);
  if (env === undefined) {
    return undefined;
  }
  return `${env.hostname} | ${env.ostype} | ${asHumanMem(env.memory)} | ${
    env.cpu
  } | ${asHumanHz(env.clockspeed)}`;
}

/**
 * Return a minimal object identifying the run id.
 */
export function benchmarkId(
  benchmarkName: string,
  exeName: string,
  suiteName: string,
  varValue: string,
  numVarValues: number,
  cores: string,
  numCores: number,
  inputSize: string,
  numInputSizes: number,
  extraArgs: string,
  numExtraArgs: number
): BenchmarkId {
  const obj: BenchmarkId = { b: benchmarkName, e: exeName, s: suiteName };

  if (numVarValues > 1) {
    obj.v = varValue;
  }
  if (numCores > 1) {
    obj.c = cores;
  }
  if (numInputSizes > 1) {
    obj.i = inputSize;
  }
  if (numExtraArgs > 1) {
    obj.ea = extraArgs;
  }
  return obj;
}

/**
 * Turn the text into lower case, but keep abbreviations in upper case.
 */
export function smartLower(text: string): string {
  const words = text.split(' ');
  const result: string[] = [];
  for (const word of words) {
    if (word.length > 1 && word === word.toUpperCase()) {
      result.push(word);
    } else {
      result.push(word.toLowerCase());
    }
  }
  return result.join(' ');
}

export function shortenCriteria(text: string): string {
  const words = text.split(' ');
  const result: string[] = [];
  for (const word of words) {
    // skip the word 'time'
    if (word.toLowerCase() === 'time') {
      continue;
    }
    result.push(word);
  }
  return result.join(' ');
}
