const pathRegex = /^([^\s]*)\/([^\s]+\s.*$)/;

export function simplifyCmdline(cmdline: string): string {
  // remove the beginning of the path, leaving only the last element of it
  // this regex is also used in somns.Rmd, the suites part, for creating a table
  return cmdline.replace(pathRegex, '$2');
}
