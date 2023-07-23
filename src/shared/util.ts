const pathRegex = /^([^\s]*)\/([^\s]+\s.*$)/;

export function simplifyCmdline(cmdline: string): string {
  // remove the beginning of the path, leaving only the last element of it
  return cmdline.replace(pathRegex, '$2');
}
