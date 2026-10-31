/**
 * Identifies the runs with profile data by their cmdline.
 */
export class HasProfile {
  private readonly cmdlines: Set<string>;

  constructor(cmdlines: Iterable<string>) {
    this.cmdlines = new Set(cmdlines);
  }

  public has(cmdline: string): boolean {
    return this.cmdlines.has(cmdline);
  }
}
