#!/usr/bin/env Rscript
## Script to Calculate the Summary Statistics for a Timeline

if (Sys.getenv("RSTUDIO") == "1" & Sys.getenv("LOGNAME") == "smarr") {
  db_user <- NULL
  db_pass <- NULL
  db_name <- "rdb_sm1"
  db_name <- "test_rdb_tmp"
  setwd("/Users/smarr/Projects/ReBenchDB/src/stats")
  num_replicates <- 1000
} else {
  args <- commandArgs(trailingOnly = TRUE)
  db_name <- args[1]
  db_user <- args[2]
  db_pass <- args[3]
  num_replicates <- as.numeric(args[4])
}

source("../views/rebenchdb.R", chdir = TRUE)
source("../views/stats.R", chdir = TRUE)

suppressMessages(library(dplyr))

rebenchdb <- connect_to_rebenchdb(db_name, db_user, db_pass)

dbBegin(rebenchdb)
qry <- dbSendQuery(rebenchdb, "
WITH deletedJobs AS ( 
    DELETE FROM TimelineCalcJob tcj
    RETURNING tcj.trialId, tcj.runId, tcj.criterion
)
SELECT m.runId, m.trialId, m.criterion, m.value
    FROM deletedJobs d
    JOIN Measurement m ON
      d.trialId = m.trialId AND
      d.runId = m.runId AND
      d.criterion = m.criterion
", immediate = TRUE)
result <- dbFetch(qry)
dbClearResult(qry)
dbCommit(rebenchdb)


# View(result)
# result$runid <- factor(result$runid)
# result$trialid <- factor(result$trialid)
# result$recordedsamples <- factor(result$recordedsamples)

calc_stats <- function (data) {
  res <- data |>
    group_by(runid, trialid, criterion) |>
    summarise(
      minval = min(value),
      maxval = max(value),
      sdval = sd(value),
      mean = mean(value),
      median = median(value),
      numsamples = length(value),

      bci95low = get_bca(value, num_replicates)$lower,
      bci95up = get_bca(value, num_replicates)$upper,
      .groups = "drop")
  res
}

stats <- result |>
  calc_stats()

# dbAppendTable(rebenchdb, "timeline", stats)
query <- "INSERT INTO timeline
  (runid, trialid, criterion, minval, maxval, sdval, mean, median, numsamples, bci95low, bci95up)
VALUES
  ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
ON CONFLICT (runid, trialid, criterion) DO UPDATE
SET
	minval = EXCLUDED.minval,
	maxval = EXCLUDED.maxval,
	sdval  = EXCLUDED.sdval,
	mean   = EXCLUDED.mean,
	median = EXCLUDED.median,
	numsamples = EXCLUDED.numsamples,
	bci95low = EXCLUDED.bci95low,
	bci95up = EXCLUDED.bci95up;"
dbExecute(rebenchdb, query, params = unname(as.list(stats)))

dbDisconnect(rebenchdb)
