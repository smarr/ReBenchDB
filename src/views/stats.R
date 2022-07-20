library(boot)

# used by get_bca
boot_median <- function(data, indices) {
  resampled_data <- data[indices]
  return (median(resampled_data))
}

# Calculates the bootstrap interval and returns median,
# and lower and upper bound of the confidence interval.
# The interval is calculated using the adjusted bootstrap percentile (BCa) method.
get_bca <- function(data, num_replicates) {
  if (length(data) < 30 | all(data == data[[1]])) {
    return(tibble(bci95low=NA, bci95up=NA))
  }

  b <- boot(data, boot_median, num_replicates) # 1000
  tryCatch({
    
    bb <- boot.ci(b, type="bca")
    # column 4 and 5 contain the lower and upper ends of the interval
    if (is.null(bb$bca[4])) {
      return(tibble(bci95low=NA, bci95up=NA))
    } else {
      return(tibble(bci95low=bb$bca[4], bci95up=bb$bca[5]))
    }
  },
  error = function (cond) {
    tryCatch({
      bb <- boot.ci(b, type="bca")
      return(tibble(bci95low=bb$normal[2], bci95up=bb$normal[3]))  
    },
    error = function (cond) {
      return(tibble(bci95low=NA, bci95up=NA))
    })
  })
}
