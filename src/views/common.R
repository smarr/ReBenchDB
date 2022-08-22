## Loading Other Libraries
source("plots.R", chdir = TRUE)
source("rebenchdb.R", chdir = TRUE)
source("stats.R", chdir = TRUE)

## Basic Setup and Functionality to be used by Rmarkdown change reports

# avoid scientific notation for numbers, it's more readable to me
options(scipen=999)

# prints stack trace on error, using rlang (tidyverse) backtraces
options(warn = 0, keep.source = TRUE, error = quote(rlang:::entrace()))

timing_data <- NULL
timing.start <- function() {
  timing_data <<- Sys.time()
}

timing.stop <- function() {
  res = difftime(Sys.time(), timing_data)
  timing_data <<- NULL
  res
}

## Utility Functions

common_string_start <- function(x) {
  x <- sort(x)
  n <- min(nchar(x))
  x <- sapply(x, function(s) {
    substr(s, 1, n)
  })
  x <- unique(x)

  # split the first and last element by character
  d_x <- strsplit(x[c(1, length(x))], "")
  # search for the first not common element and so, get the last matching one
  der_com <- match(FALSE, do.call("==", d_x)) - 1
  # if there is no matching element, return an empty vector, else return the common part
  # if (der_com == 0) {
  #   character(0)
  # } else {
  #   substr(x[1], 1, der_com)
  # }
  if (is.na(der_com)) {
    n + 1
  } else {
    der_com
  }
}


## Output Formatting

r2 <- function(val) {
  if (length(val) == 0 || is.na(val)) {
    ""
  } else {
    format(round(val, 2), digits = 2, nsmall = 2)
  }
}

pro <- function(val) {
  if (length(val) == 0 || is.na(val)) {
    ""
  } else {
    as.character(round(val * 100))
  }
}
