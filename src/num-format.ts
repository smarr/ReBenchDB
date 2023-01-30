export function r0(val: number): string {
  return val.toFixed(0);
}

export function r2(val: number): string {
  return val.toFixed(2);
}

export function per(val: number): string {
  return (val * 100).toFixed(0);
}

export function asHumanMem(x: number): string {
  return 'asHumanMem';
  // as_human_mem <- function(x, digits = 3) {
  //   if (is.na(x) || length(x) == 0) {
  //     return("")
  //   }
  //
  //   m <- x
  //   mem <- c("b", "kb", "MB", "GB")
  //   i <- 1
  //   while (i <= 4 && m > 1024) {
  //     m <- m / 1024
  //     i <- i + 1
  //   }
  //   paste0(format(m, digits = digits), mem[[i]])
  // }
}
