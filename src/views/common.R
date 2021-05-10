## Loading Other Libraries
source("plots.R", chdir = TRUE)
source("rebenchdb.R", chdir = TRUE)
source("stats.R", chdir = TRUE)

## Basic Setup and Functionality to be used by Rmarkdown change reports

# avoid scientific notation for numbers, it's more readable to me
options(scipen=999)

# prints stack trace on error, using rlang (tidyverse) backtraces
options(warn = 2, keep.source = TRUE, error = quote(rlang:::entrace()))

timing_data <- NULL
timing.start <- function() {
  timing_data <<- Sys.time()
}

timing.stop <- function() {
  res = difftime(Sys.time(), timing_data)
  timing_data <<- NULL
  res
}


## Output Formatting

r2 <- function(val) {
  if (is.na(val)) {
    ""
  } else {
    format(round(val, 2), digits = 2, nsmall = 2)
  }
}

pro <- function(val) {
  if (is.na(val)) {
    ""
  } else {
    as.character(round(val * 100))  
  }
}
