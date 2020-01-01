library(boot)

# used by get_bca
boot_median <- function(data, indices) {
  resampled_data <- data[indices]
  return (median(resampled_data))
}

# Calculates the bootstrap interval and returns median,
# and lower and upper bound of the confidence interval.
# The interval is calculated using the adjusted bootstrap percentile (BCa) method.
get_bca <- function(data) {
  if (length(data) < 30) {
    return(return(list(median=NA, lower=NA, upper=NA)))
  }

  b <- boot(data, boot_median, 1000)
  bb <- boot.ci(b, type="bca")
  # column 4 and 5 contain the lower and upper ends of the interval
  return(list(median=b$t0, lower=bb$bca[4], upper=bb$bca[5]))
}
