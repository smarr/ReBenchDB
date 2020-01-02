#!/usr/bin/env Rscript
## Script to Calculate the Summary Statistics for a Timeline

if (Sys.getenv("RSTUDIO") == "1" & Sys.getenv("LOGNAME") == "smarr") {
  db_user <- NULL
  db_pass <- NULL
  db_name <- "rdb_sm1"
  setwd("/Users/smarr/Projects/ReBenchDB/src/stats")
} else {
  args <- commandArgs(trailingOnly = TRUE)
  db_name <- args[1]
  db_user <- args[2]
  db_pass <- args[3]
}

source("../views/rebenchdb.R", chdir = TRUE)
source("../views/stats.R", chdir = TRUE)

suppressMessages(library(dplyr))

rebenchdb <- connect_to_rebenchdb(db_name, db_user, db_pass)

qry <- dbSendQuery(rebenchdb, "
WITH incompleteTimeline
AS (
	-- find the trial/run/criterion combinations that have more samples than recorded in the timeline
	SELECT m.trialId as trialId, m.runId as runId, m.criterion as criterion, COUNT(m.*) as actualRowCnt, t.numSamples as recordedSamples
		FROM Measurement m
			JOIN Run r ON m.runId = r.id
			LEFT JOIN Timeline t ON m.trialId = t.trialId AND m.runId = t.runId AND m.criterion = t.criterion
		-- Don't load warmup data, already discard it in the database
		WHERE iteration >= warmup OR warmup IS NULL
		GROUP BY m.trialId, m.runId, m.criterion, t.numSamples
		HAVING COUNT(m.*) > t.numSamples OR t.numSamples IS NULL
)
SELECT m.runId, m.trialId, m.criterion, value, recordedSamples
	FROM Measurement m
	JOIN incompleteTimeline itl ON itl.trialId = m.trialId AND itl.runId = m.runId AND itl.criterion = m.criterion")
result <- dbFetch(qry)
dbClearResult(qry)

# View(result)
result$runid <- factor(result$runid)
result$trialid <- factor(result$trialid)
result$recordedsamples <- factor(result$recordedsamples)

with_tl_entry <- result %>%
  filter(!is.na(recordedsamples)) %>%
  group_by(runid, trialid, criterion) %>%
  summarise()

calc_stats <- function (data) {
  res <- data %>%
    group_by(runid, trialid, criterion) %>%
    summarise(
      minval = min(value),
      maxval = max(value),
      sdval = sd(value),
      mean = mean(value),
      median = median(value),
      numsamples = length(value),

      bci95low = get_bca(value)$lower,
      bci95up = get_bca(value)$upper)
  res
}

if (nrow(with_tl_entry) > 0) {
  res <- dbSendStatement(rebenchdb, "DELETE FROM Timeline WHERE runid = $1 AND trialid = $2 AND criterion = $3")
  for (i in seq(nrow(with_tl_entry))) {
    current_row <- unname(as.vector(with_tl_entry[i, ]))
    if (!is.na(current_row[1])) {
      dbBind(res, current_row)
    }
  }
  dbClearResult(res);
}

stats <- result %>%
  calc_stats()
dbAppendTable(rebenchdb, "timeline", stats)

dbDisconnect(rebenchdb)
