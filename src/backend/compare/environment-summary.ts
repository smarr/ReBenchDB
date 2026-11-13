import type { Environment, TrialDetails } from '../db/types.js';
import type {
  EnvironmentProperty,
  EnvironmentRow,
  EnvironmentTable
} from '../../shared/view-types.js';
import { asHumanHz, asHumanMem } from '../../shared/data-format.js';

export interface EnvironmentPropertyGroup {
  name: string;
  properties: EnvironmentProperty[];
}

/**
 * The hardware, software, and denoise details of an environment,
 * for the baseline and the change.
 */
export interface EnvironmentSummary {
  envId: number;
  hostname: string;
  ostype: string;
  cpu: string;

  inBase: boolean;
  inChange: boolean;

  numDifferences: number;
  groups: EnvironmentPropertyGroup[];
}

/** The values of a property, for the baseline and the change. */
class PropertyValues {
  public readonly base = new Set<string>();
  public readonly change = new Set<string>();
}

/** The properties of a group, in the order they were first reported. */
type GroupValues = Map<string, PropertyValues>;

interface EnvironmentValues {
  envId: number;
  hostname: string;
  ostype: string;
  cpu: string;

  inBase: boolean;
  inChange: boolean;

  hardware: GroupValues;
  software: GroupValues;
  denoise: GroupValues;
}

function addValue(
  group: GroupValues,
  name: string,
  value: string,
  isBase: boolean
): void {
  let values = group.get(name);
  if (values === undefined) {
    values = new PropertyValues();
    group.set(name, values);
  }
  if (isBase) {
    values.base.add(value);
  } else {
    values.change.add(value);
  }
}

function isKnown(value: string | null): value is string {
  return value !== null && Number(value) > 0;
}

function addTrial(env: EnvironmentValues, t: TrialDetails, isBase: boolean) {
  if (isBase) {
    env.inBase = true;
  } else {
    env.inChange = true;
  }

  if (isKnown(t.memory)) {
    addValue(env.hardware, 'Memory', asHumanMem(Number(t.memory), 2), isBase);
  }
  if (isKnown(t.clockspeed)) {
    const speed = asHumanHz(Number(t.clockspeed), 2);
    addValue(env.hardware, 'Clock Speed', speed, isBase);
  }

  for (const s of t.software) {
    addValue(env.software, s.name, s.version, isBase);
  }

  if (t.denoise) {
    for (const [name, value] of Object.entries(t.denoise)) {
      const v = value === null ? 'unknown' : String(value);
      addValue(env.denoise, name, v, isBase);
    }
  }
}

function sameValues(a: Set<string>, b: Set<string>): boolean {
  return a.size === b.size && [...a].every((v) => b.has(v));
}

function toGroup(
  name: string,
  group: GroupValues,
  compare: boolean
): EnvironmentPropertyGroup {
  const properties: EnvironmentProperty[] = [];
  for (const [propName, values] of group) {
    properties.push({
      name: propName,
      base: [...values.base],
      change: [...values.change],
      differs: compare && !sameValues(values.base, values.change)
    });
  }
  return { name, properties };
}

function toSummary(env: EnvironmentValues): EnvironmentSummary {
  // an environment used by only one of the commits is not compared
  const compare = env.inBase && env.inChange;

  const groups = [
    toGroup('Hardware', env.hardware, compare),
    toGroup('Software', env.software, compare),
    toGroup('Denoise', env.denoise, compare)
  ].filter((g) => g.properties.length > 0);

  let numDifferences = 0;
  for (const g of groups) {
    numDifferences += g.properties.filter((p) => p.differs).length;
  }

  return {
    envId: env.envId,
    hostname: env.hostname,
    ostype: env.ostype,
    cpu: env.cpu,
    inBase: env.inBase,
    inChange: env.inChange,
    numDifferences,
    groups
  };
}

/**
 * Summarize the hardware, software, and denoise details reported by the
 * trials of the baseline and the change, for each environment.
 */
export function summarizeEnvironments(
  trials: TrialDetails[],
  baseCommitId: string,
  changeCommitId: string
): EnvironmentSummary[] {
  const envs = new Map<number, EnvironmentValues>();

  for (const t of trials) {
    const isBase = t.commitid === baseCommitId;
    if (!isBase && t.commitid !== changeCommitId) {
      continue;
    }

    let env = envs.get(t.envid);
    if (env === undefined) {
      env = {
        envId: t.envid,
        hostname: t.hostname,
        ostype: t.ostype,
        cpu: t.cpu,
        inBase: false,
        inChange: false,
        hardware: new Map(),
        software: new Map(),
        denoise: new Map()
      };
      envs.set(t.envid, env);
    }
    addTrial(env, t, isBase);
  }

  return [...envs.values()]
    .sort(
      (a, b) =>
        a.hostname.localeCompare(b.hostname) ||
        (a.cpu ?? '').localeCompare(b.cpu ?? '')
    )
    .map(toSummary);
}

/**
 * Combine the summaries of all environments into a single table,
 * with a row for each detail reported by any of the environments.
 *
 * An environment gets separate columns for baseline and change only if
 * the two differ.
 */
export function toEnvironmentTable(
  summaries: EnvironmentSummary[]
): EnvironmentTable {
  const columns = summaries.map((s) => ({
    envId: s.envId,
    hostname: s.hostname,
    ostype: s.ostype,
    cpu: s.cpu,
    inBase: s.inBase,
    inChange: s.inChange,
    split: s.numDifferences > 0
  }));

  const groups = new Map<string, Map<string, EnvironmentRow>>();
  for (const name of ['Hardware', 'Software', 'Denoise']) {
    groups.set(name, new Map());
  }

  summaries.forEach((s, i) => {
    for (const g of s.groups) {
      const rows = groups.get(g.name)!;
      for (const p of g.properties) {
        let row = rows.get(p.name);
        if (row === undefined) {
          row = { name: p.name, values: summaries.map(() => null) };
          rows.set(p.name, row);
        }
        row.values[i] = { base: p.base, change: p.change, differs: p.differs };
      }
    }
  });

  return {
    columns,
    groups: [...groups]
      .map(([name, rows]) => ({ name, rows: [...rows.values()] }))
      .filter((g) => g.rows.length > 0)
  };
}

export function environmentsOf(trials: TrialDetails[]): Environment[] {
  const envs = new Map<number, Environment>();
  for (const t of trials) {
    if (!envs.has(t.envid)) {
      envs.set(t.envid, {
        id: t.envid,
        hostname: t.hostname,
        ostype: t.ostype,
        cpu: t.cpu,
        note: t.note
      });
    }
  }
  return [...envs.values()].sort((a, b) => a.id - b.id);
}
