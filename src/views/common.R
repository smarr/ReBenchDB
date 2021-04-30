## Loading Other Libraries
source("plots.R", chdir = TRUE)
source("rebenchdb.R", chdir = TRUE)
source("stats.R", chdir = TRUE)

## Basic Setup and Functionality to be used by Rmarkdown change reports

# avoid scientific notation for numbers, it's more readable to me
options(scipen=999)

# prints stack trace on error, from: http://stackoverflow.com/a/2000757/916546
options(warn = 2, keep.source = TRUE, error =
          quote({
            cat("Environment:\n", file=stderr());

            # TODO: setup option for dumping to a file (?)
            # Set `to.file` argument to write this to a file for post-mortem debugging
            dump.frames();  # writes to last.dump

            #
            # Debugging in R
            #   http://www.stats.uwo.ca/faculty/murdoch/software/debuggingR/index.shtml
            #
            # Post-mortem debugging
            #   http://www.stats.uwo.ca/faculty/murdoch/software/debuggingR/pmd.shtml
            #
            # Relation functions:
            #   dump.frames
            #   recover
            # >>limitedLabels  (formatting of the dump with source/line numbers)
            #   sys.frame (and associated)
            #   traceback
            #   geterrmessage
            #
            # Output based on the debugger function definition.

            n <- length(last.dump)
            calls <- names(last.dump)
            cat(paste("  ", 1L:n, ": ", calls, sep = ""), sep = "\n", file=stderr())
            cat("\n", file=stderr())

            if (!interactive()) {
              q(status=1) # indicate error
            }
          }))

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
    return("")
  }
  return(round(val, 2))
}

pro <- function(val) {
  if (is.na(val)) {
    return("")
  }
  return(round(val * 100))
}
