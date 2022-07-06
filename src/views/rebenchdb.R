## Interface to ReBenchDB
## Exposes standardized data sets for access by reports.
library(RPostgres)
library(DBI)
suppressMessages(library(qs))

load_data_file <- function(filename) {
  qread(filename)  
}

load_data_url <- function(url) {
  # url <- "https://rebench.stefan-marr.de/rebenchdb/get-exp-data/37"
  safe_name <- str_replace_all(url, "[:/.]", "-")
  cache_file <- paste0(str_replace_all(safe_name, "-+", "-"), ".qs")
  
  if(!file.exists(cache_file)) {
    download.file(url=url, destfile=cache_file)
  }
  
  tryCatch(
    qread(cache_file),
    error = function(c) {
      file.remove(cache_file)
      Sys.sleep(10)
      load_data(url)
    }
  )
}


connect_to_rebenchdb <- function(dbname, user, pass) {
  host <- if (Sys.getenv("DB_HOST") == "") { NULL } else { Sys.getenv("DB_HOST") }
  port <- if (Sys.getenv("DB_PORT") == "") { NULL } else { Sys.getenv("DB_PORT") }
  DBI::dbConnect(
    RPostgres::Postgres(),
    host = host,
    port = port,
    dbname = dbname,
    user = user,
    password = pass)
}

main_data_select <- "
    SELECT expId, runId, trialId, substring(commitId, 1, 6) as commitid,
      benchmark.name as bench, executor.name as exe, suite.name as suite,
      cmdline, varValue, cores, inputSize, extraArgs,
      invocation, iteration, warmup,
      criterion.name as criterion, criterion.unit as unit,
      value,  warmup, envid"

main_data_from <- "
    FROM Measurement
      JOIN Trial ON trialId = Trial.id
      JOIN Experiment ON expId = Experiment.id
      JOIN Source ON source.id = sourceId
      JOIN Criterion ON criterion = criterion.id
      JOIN Run ON runId = run.id
      JOIN Suite ON suiteId = suite.id
      JOIN Benchmark ON benchmarkId = benchmark.id
      JOIN Executor ON execId = executor.id 
      "

get_measures_for_comparison <- function(rebenchdb, hash_1, hash_2) {
  qry <- dbSendQuery(rebenchdb,
            paste0(main_data_select, main_data_from,
                   "WHERE commitId = $1 OR commitid = $2
                    ORDER BY expId, runId, invocation, iteration, criterion"))
  dbBind(qry, list(hash_1, hash_2))
  result <- dbFetch(qry)
  dbClearResult(qry)

  factorize_result(result)
}

get_measures_for_experiment <- function(rebenchdb, exp_id) {
  qry <- dbSendQuery(rebenchdb,
                     paste0(main_data_select, main_data_from,
                            "WHERE Experiment.id = $1
                    ORDER BY runId, trialId, cmdline, invocation, iteration, criterion"))
  dbBind(qry, list(exp_id))
  result <- dbFetch(qry)
  dbClearResult(qry)
  
  factorize_result(result)
}

profile_available_select <- "
  SELECT expId, runId, trialId, substring(commitId, 1, 6) as commitid,
    benchmark.name as bench, executor.name as exe, suite.name as suite,
    cmdline, varValue, cores, inputSize, extraArgs,
    invocation, numIterations"

profile_available_from <- "
  FROM ProfileData
    JOIN Trial ON trialId = Trial.id
    JOIN Experiment ON expId = Experiment.id
    JOIN Source ON source.id = sourceId
    JOIN Run ON runId = run.id
    JOIN Suite ON suiteId = suite.id
    JOIN Benchmark ON benchmarkId = benchmark.id
    JOIN Executor ON execId = executor.id 
    "

# fetch all benchmarks information from the database
get_environments <- function(){
  qry <- dbSendQuery(rebenchdb, "SELECT id, hostname, ostype, memory, cpu, clockspeed FROM environment")
  result <- dbFetch(qry)
  dbClearResult(qry)
  result$id <- factor(result$id)
  result$hostname <- factor(result$hostname)
  result$ostype <- factor(result$ostype)
  result$memory <- factor(result$memory)
  result$cpu <- factor(result$cpu)
  result$clockspeed <- factor(result$clockspeed)

  result
}

get_profile_availability <- function(rebenchdb, hash_1, hash_2) {
  qry <- dbSendQuery(rebenchdb,
                     paste0(profile_available_select, profile_available_from,
                            "WHERE (commitId = $1 OR commitid = $2)
                             ORDER BY expId, runId, invocation, numIterations"))
  dbBind(qry, list(hash_1, hash_2))
  result <- dbFetch(qry)
  dbClearResult(qry)
  
  factorize_result(result)
}

factorize_result <- function(result) {
  result$expid <- factor(result$expid)
  result$trialid <- factor(result$trialid)
  result$runid <- factor(result$runid)
  result$commitid <- factor(result$commitid)
  result$bench <- factor(result$bench)
  result$suite <- factor(result$suite)
  result$exe <- factor(result$exe)
  result$cmdline <- factor(result$cmdline)
  result$varvalue <- forcats::fct_explicit_na(factor(result$varvalue), na_level = "")
  result$cores <- factor(result$cores)
  result$inputsize <- forcats::fct_explicit_na(factor(result$inputsize), na_level = "")
  result$extraargs <- forcats::fct_explicit_na(factor(result$extraargs), na_level = "")

  if ("envid" %in% colnames(result)) {
     result$envid <- factor(result$envid)
  }
  
  
  if ("criterion" %in% colnames(result)) {
    result$criterion <- factor(result$criterion)
    result$unit <- factor(result$unit)
  }
  
  result
}

disconnect_rebenchdb <- function(rebenchdb) {
  dbDisconnect(rebenchdb)
}
