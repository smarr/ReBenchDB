#!/usr/bin/env Rscript
library(qs)

cmd_args <- commandArgs(trailingOnly = TRUE)

exp_id  <- cmd_args[1] # exp_id <- 65
lib_dir <- cmd_args[2] # lib_dir <- "."
db_user <- cmd_args[3] # db_user <- NULL
db_pass <- cmd_args[4] # db_pass <- NULL
db_name <- cmd_args[5] # db_name <- "rdb_smde" # rdb_sm1
out_file <- cmd_args[6]


source(paste0(lib_dir, "/rebenchdb.R"), chdir=TRUE)

rebenchdb <- connect_to_rebenchdb(db_name, db_user, db_pass)
start_time <- Sys.time()
result <- get_measures_for_experiment(rebenchdb, exp_id)
end_time <- Sys.time()
cat("db time\t"); print(end_time - start_time); cat("\n")

disconnect_rebenchdb(rebenchdb)

start_time <- Sys.time()
saveRDS(result, paste0(out_file, ".gz"), compress = "gzip")
end_time <- Sys.time()
cat("gzip\t"); print(end_time - start_time); cat("\n")

start_time <- Sys.time()
saveRDS(result, paste0(out_file, ".bz2"), compress = "bzip2")
end_time <- Sys.time()
cat("bzip2\t"); print(end_time - start_time); cat("\n")

start_time <- Sys.time()
saveRDS(result, paste0(out_file, ".xz"), compress = "xz")
end_time <- Sys.time()
cat("xz\t"); print(end_time - start_time); cat("\n")

start_time <- Sys.time()
qsave(result, paste0(out_file, ".qs"))
end_time <- Sys.time()
cat("qs\t"); print(end_time - start_time); cat("\n")

start_time <- Sys.time()
qsave(result, paste0(out_file, ".archive.qs"), preset = "archive")
end_time <- Sys.time()
cat("qs archive\t"); print(end_time - start_time); cat("\n")
