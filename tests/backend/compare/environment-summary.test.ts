import { describe, expect, it } from '@jest/globals';

import {
  EnvironmentSummary,
  environmentsOf,
  summarizeEnvironments,
  toEnvironmentTable
} from '../../../src/backend/compare/environment-summary.js';
import type { TrialDetails } from '../../../src/backend/db/types.js';

const base = 'aaaaaa';
const change = 'bbbbbb';

const GB = 1024 * 1024 * 1024;

function trial(
  trialid: number,
  commitid: string,
  details: Partial<TrialDetails> = {}
): TrialDetails {
  return {
    trialid,
    commitid,
    envid: 1,
    hostname: 'host',
    ostype: 'Linux',
    cpu: 'CPU A',
    note: '',
    memory: String(16 * GB),
    clockspeed: '3000000000',
    denoise: { no_turbo: true, scaling_governor: 'performance' },
    software: [
      { name: 'kernel-release', version: '6.1.0' },
      { name: 'architecture', version: 'x86_64' }
    ],
    ...details
  };
}

function rowsOf(summary: EnvironmentSummary) {
  return summary.groups.map((g) => ({
    group: g.name,
    rows: g.properties.map((p) => [p.name, p.base, p.change, p.differs])
  }));
}

describe('summarizeEnvironments()', () => {
  it('should report the details of an environment of both commits', () => {
    const result = summarizeEnvironments(
      [trial(1, base), trial(2, change)],
      base,
      change
    );

    expect(result).toHaveLength(1);
    const env = result[0];
    expect(env.envId).toEqual(1);
    expect(env.hostname).toEqual('host');
    expect(env.ostype).toEqual('Linux');
    expect(env.cpu).toEqual('CPU A');
    expect(env.inBase).toBe(true);
    expect(env.inChange).toBe(true);
    expect(env.numDifferences).toEqual(0);

    expect(rowsOf(env)).toEqual([
      {
        group: 'Hardware',
        rows: [
          ['Memory', ['16.00GB'], ['16.00GB'], false],
          ['Clock Speed', ['3.00GHz'], ['3.00GHz'], false]
        ]
      },
      {
        group: 'Software',
        rows: [
          ['kernel-release', ['6.1.0'], ['6.1.0'], false],
          ['architecture', ['x86_64'], ['x86_64'], false]
        ]
      },
      {
        group: 'Denoise',
        rows: [
          ['no_turbo', ['true'], ['true'], false],
          ['scaling_governor', ['performance'], ['performance'], false]
        ]
      }
    ]);
  });

  it('should highlight the details that differ', () => {
    const result = summarizeEnvironments(
      [
        trial(1, base),
        trial(2, change, {
          memory: String(32 * GB),
          software: [
            { name: 'kernel-release', version: '6.8.0' },
            { name: 'architecture', version: 'x86_64' }
          ]
        })
      ],
      base,
      change
    );

    const env = result[0];
    expect(env.numDifferences).toEqual(2);
    expect(rowsOf(env)).toEqual([
      {
        group: 'Hardware',
        rows: [
          ['Memory', ['16.00GB'], ['32.00GB'], true],
          ['Clock Speed', ['3.00GHz'], ['3.00GHz'], false]
        ]
      },
      {
        group: 'Software',
        rows: [
          ['kernel-release', ['6.1.0'], ['6.8.0'], true],
          ['architecture', ['x86_64'], ['x86_64'], false]
        ]
      },
      {
        group: 'Denoise',
        rows: [
          ['no_turbo', ['true'], ['true'], false],
          ['scaling_governor', ['performance'], ['performance'], false]
        ]
      }
    ]);
  });

  it('should treat a detail reported for only one commit as different', () => {
    const result = summarizeEnvironments(
      [trial(1, base, { denoise: null, software: [] }), trial(2, change)],
      base,
      change
    );

    const env = result[0];
    expect(env.numDifferences).toEqual(4);
    expect(rowsOf(env).slice(1)).toEqual([
      {
        group: 'Software',
        rows: [
          ['kernel-release', [], ['6.1.0'], true],
          ['architecture', [], ['x86_64'], true]
        ]
      },
      {
        group: 'Denoise',
        rows: [
          ['no_turbo', [], ['true'], true],
          ['scaling_governor', [], ['performance'], true]
        ]
      }
    ]);
  });

  it('should list all values of the trials of a commit', () => {
    const result = summarizeEnvironments(
      [
        trial(1, base),
        trial(2, base, { denoise: { no_turbo: false } }),
        trial(3, change, { denoise: { no_turbo: false } })
      ],
      base,
      change
    );

    const denoise = result[0].groups.find((g) => g.name === 'Denoise');
    expect(denoise?.properties).toEqual([
      {
        name: 'no_turbo',
        base: ['true', 'false'],
        change: ['false'],
        differs: true
      },
      {
        name: 'scaling_governor',
        base: ['performance'],
        change: [],
        differs: true
      }
    ]);
  });

  it('should not compare an environment used for only one commit', () => {
    const result = summarizeEnvironments(
      [
        trial(1, base),
        trial(2, change),
        trial(3, change, {
          envid: 2,
          hostname: 'other',
          memory: String(32 * GB)
        })
      ],
      base,
      change
    );

    expect(result.map((e) => e.hostname)).toEqual(['host', 'other']);
    const other = result[1];
    expect(other.inBase).toBe(false);
    expect(other.inChange).toBe(true);
    expect(other.numDifferences).toEqual(0);
    expect(other.groups[0].properties[0]).toEqual({
      name: 'Memory',
      base: [],
      change: ['32.00GB'],
      differs: false
    });
  });

  it('should leave out unknown hardware details and empty groups', () => {
    const result = summarizeEnvironments(
      [
        trial(1, base, {
          memory: null,
          clockspeed: '0',
          denoise: null,
          software: []
        }),
        trial(2, change, {
          memory: null,
          clockspeed: null,
          denoise: {},
          software: []
        })
      ],
      base,
      change
    );

    expect(result[0].groups).toEqual([]);
    expect(result[0].numDifferences).toEqual(0);
  });

  it('should show unknown denoise values as such', () => {
    const result = summarizeEnvironments(
      [
        trial(1, base, { denoise: { initial_no_turbo: null } }),
        trial(2, change, { denoise: { initial_no_turbo: null } })
      ],
      base,
      change
    );

    const denoise = result[0].groups.find((g) => g.name === 'Denoise');
    expect(denoise?.properties).toEqual([
      {
        name: 'initial_no_turbo',
        base: ['unknown'],
        change: ['unknown'],
        differs: false
      }
    ]);
  });
});

describe('toEnvironmentTable()', () => {
  function tableFor(trials: TrialDetails[]) {
    return toEnvironmentTable(summarizeEnvironments(trials, base, change));
  }

  it('should combine baseline and change if they do not differ', () => {
    const table = tableFor([trial(1, base), trial(2, change)]);

    expect(table.columns).toHaveLength(1);
    expect(table.columns[0].split).toBe(false);
    expect(table.groups.map((g) => g.name)).toEqual([
      'Hardware',
      'Software',
      'Denoise'
    ]);
    expect(table.groups[0].rows[0]).toEqual({
      name: 'Memory',
      values: [{ base: ['16.00GB'], change: ['16.00GB'], differs: false }]
    });
  });

  it('should split baseline and change of a machine with differences', () => {
    const table = tableFor([
      trial(1, base),
      trial(2, change, { memory: String(32 * GB) })
    ]);

    expect(table.columns[0].split).toBe(true);
  });

  it('should not split a machine used for only one commit', () => {
    const table = tableFor([
      trial(1, base),
      trial(2, change),
      trial(3, change, { envid: 2, hostname: 'other' })
    ]);

    expect(table.columns.map((c) => [c.hostname, c.split])).toEqual([
      ['host', false],
      ['other', false]
    ]);
  });

  it('should have a row for each detail of any machine', () => {
    const table = tableFor([
      trial(1, base, { software: [{ name: 'java', version: '21' }] }),
      trial(2, change, { software: [{ name: 'java', version: '21' }] }),
      trial(3, change, {
        envid: 2,
        hostname: 'other',
        denoise: null,
        software: [
          { name: 'kernel-release', version: '6.8.0' },
          { name: 'java', version: '17' }
        ]
      })
    ]);

    expect(table.groups.map((g) => g.name)).toEqual([
      'Hardware',
      'Software',
      'Denoise'
    ]);
    expect(table.groups[1].rows).toEqual([
      {
        name: 'java',
        values: [
          { base: ['21'], change: ['21'], differs: false },
          { base: [], change: ['17'], differs: false }
        ]
      },
      {
        name: 'kernel-release',
        values: [null, { base: [], change: ['6.8.0'], differs: false }]
      }
    ]);
    expect(table.groups[2].rows[0].values[1]).toBeNull();
  });
});

describe('environmentsOf()', () => {
  it('should list each environment once, ordered by id', () => {
    const envs = environmentsOf([
      trial(1, base, { envid: 2, hostname: 'other' }),
      trial(2, base),
      trial(3, change, { envid: 2, hostname: 'other' }),
      trial(4, change)
    ]);

    expect(envs).toEqual([
      { id: 1, hostname: 'host', ostype: 'Linux', cpu: 'CPU A', note: '' },
      { id: 2, hostname: 'other', ostype: 'Linux', cpu: 'CPU A', note: '' }
    ]);
  });
});
