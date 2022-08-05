#!/usr/bin/env Rscript
library(qs)

cmd_args <- commandArgs(trailingOnly = TRUE)

exp_id  <- cmd_args[1] # exp_id <- 65
lib_dir <- cmd_args[2] # lib_dir <- "."
db_user <- cmd_args[3] # db_user <- NULL
db_pass <- cmd_args[4] # db_pass <- NULL
db_name <- cmd_args[5] # db_name <- "rdb_smde" # rdb_sm1
db_host <- cmd_args[6]
db_port <- cmd_args[7]
out_file <- cmd_args[8]


source(paste0(lib_dir, "/rebenchdb.R"), chdir=TRUE)

rebenchdb <- connect_to_rebenchdb(db_name, db_user, db_pass, db_host, db_port)
result <- get_measures_for_experiment(rebenchdb, exp_id)
disconnect_rebenchdb(rebenchdb)
qsave(result, out_file)
