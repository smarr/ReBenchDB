#!/usr/bin/env Rscript
#
# SOMns Performance Comparison Report
args <- commandArgs(trailingOnly = TRUE)

if (length(args) < 11 | args[[1]] == '--help') {
  cat("Performance Comparison Report

Usage: somns.R outputFile outputDir baselineHash changeHash baselineColor changeColor dbName dbUser dbPass [extraCmd]

  outputFile       the name for the HTML file that is produced
  outputDir        the name for the folder with images produced
  libDir           the path where common.R can be found
  baselineHash     the commit hash of the baseline
  changeHash       the commit hash of the change
  baselineColor    the color used to represent the baseline
  changeColor      the color used to represent the change

  dbName           name of the database
  dbUser           name of the user used to connect to the DB
  dbPass           password used for the DB

  extraCmd         a command interpreted by the script
                   as a ; separated list
")
}

output_file    <- args[[1]]
output_dir     <- args[[2]]
lib_dir        <- args[[3]]
baseline_hash  <- args[[4]]
change_hash    <- args[[5]]
baseline_color <- args[[6]]
change_color   <- args[[7]]
db_name        <- args[[8]]
db_user        <- args[[9]]
db_pass        <- args[[10]]
extra_cmd      <- args[[11]]

# baseline_hash <- "b0bd089afdb2f3437c52486630ceb82e96a741d9"
# change_hash   <- "b3d66873c97cac6d4e2f79e8b6a91e3397161b62"
# baseline_color <- "#729fcf"
# change_color   <- "#e9b96e"
# db_user        <- NULL  # "rdb_sm1"
# db_pass        <- NULL
# db_name        <- "rdb_sm1"

# Load Libraries
source(paste0(lib_dir, "/common.R"), chdir=TRUE)
library(dplyr)
library(stringr)
options(warn=1)

baseline_hash6 <- substr(baseline_hash, 1, 6)
change_hash6 <- substr(change_hash, 1, 6)
color <- setNames(c(baseline_color, change_color), c(baseline_hash6, change_hash6))
cmds <- str_split(extra_cmd, ";")[[1]]


## Further configuration
fast_color <- "#e4ffc7"
slow_color <- "#ffcccc"
faster_runtime_ratio <- 0.95
slower_runtime_ratio <- 1.05

# Start Timing of Report Generation
timing.start()

## File Output
output_file_connection <- NULL

out <- function(...) {
  writeLines(c(...), con = output_file_connection, sep = "")
}

## Create Directories and Open Output File
dir.create(output_dir, showWarnings = FALSE, recursive = TRUE)

cat("Opening ", output_file, "\n")
output_file_connection <- file(output_file, "w+")

## Load Data
if (cmds[1] == "from-file") {
  # manual from-file: result <- rbind(load_data_file("~/Projects/ReBenchDB/tmp/TruffleSOM-380.qs"), load_data_file("~/Projects/ReBenchDB/tmp/TruffleSOM-381.qs"))
  result <- rbind(load_data_file(cmds[2]), load_data_file(cmds[3]))
  result <- factorize_result(result)
} else {
  # load_and_install_if_necessary("psych")   # uses only geometric.mean
  rebenchdb <- connect_to_rebenchdb(db_name, db_user, db_pass)
  result <- get_measures_for_comparison(rebenchdb, baseline_hash, change_hash)
  disconnect_rebenchdb(rebenchdb)
}

## Process Data
warmup <- result %>%
  filter(!grepl("startup", suite, fixed = TRUE),
         !grepl("interp", exe, fixed = TRUE)) %>%
  droplevels()

peak <- result %>%
  group_by(commitid, exe, suite, bench,
           varvalue, cores, inputsize, extraargs) %>%
  filter(is.na(warmup) | iteration >= warmup)


base <- peak %>%
  filter(commitid == baseline_hash6) %>%
  group_by(exe, suite, bench,
           varvalue, cores, inputsize, extraargs) %>%
  summarise(base_mean = mean(value),
            base_median = median(value),
            .groups = "drop")

norm <- peak %>%
  left_join(base, by = c("exe", "suite", "bench",
                         "varvalue", "cores", "inputsize", "extraargs")) %>%
  group_by(exe, suite, bench,
           varvalue, cores, inputsize, extraargs) %>%
  transform(ratio_mean = value / base_mean,
            ratio_median = value / base_median)

calculate_stats <- function(data) {
  data %>% summarise(
    unit = unit[1],
    # min = min(value),
    # max = max(value),
    # sd = sd(value),
    # mean = mean(value),
    median = median(value),
    samples = length(value),

    # mean_ratio_mean = mean(ratio_mean),
    # median_ratio_median = median(ratio_mean),
    # mean_ratio_median = mean(ratio_median),

    # Too detailed, don't use it when looking at reports
    # lowerBCI95 = get_bca(value, 1000)$lower,
    # upperBCI95 = get_bca(value, 1000)$upper,
    #
    ratio = median / base_median[1],
    # ratioLower = lowerBCI95 / base_median[1],
    # ratioUpper = upperBCI95 / base_median[1],
    #
    change_m = ratio - 1,
    # change_l = ratioLower - 1,
    # change_u = ratioUpper - 1,
    .groups = "drop")
}


stats <- norm %>%
  group_by(commitid, exe, suite, bench,
           varvalue, cores, inputsize, extraargs) %>%
  filter(is.na(warmup) | iteration >= warmup) %>%
  calculate_stats()

not_in_both <- stats %>%
  filter(is.na(ratio)) %>%
  droplevels()

stats <- stats %>%
  filter(!is.na(ratio)) %>%
  droplevels()

geometric.mean <- function(x) { exp(mean(log(x))) }

## Are we faster/slower? have a rough 5% boundary for all the noise
slower_category <- function(data) {
  m <- geometric.mean(data)
  if (m > 1.05) {
    return("slower")
  } else if (m < 0.95) {
    return("faster")
  } else {
    return("indeterminate")
  }
}


if (nrow(stats %>% filter(commitid == change_hash6)) == 0) {
  out("<h3>Issue with Unexpected Data</h3>",
      "<p>The data provided for baseline and change does not seem to have a common benchmarks/executors.</p>\n",
      "<p>This is known to happen for instance, when benchmarks or parameters are changed, or executors renamed.</p>\n")
  cat("Data provided for baseline and change does not have any common benchmark/executor\n", file = stderr())
  quit(status = 0)
}

stats_suite <- stats %>%
  filter(commitid == change_hash6) %>% # need to remove it so that statistics are accurate, or put it into the group
  filter(!is.na(ratio)) %>%            # filter out the benchmarks not in both data sets
  group_by(exe, suite) %>%
  summarise(
    unit = unit[1],
    min = min(ratio),
    max = max(ratio),
    geomean = geometric.mean(ratio),
    num_benchmarks = length(ratio),
    slower = slower_category(ratio),
    .groups = "drop")

stats_suite$slower <- factor(stats_suite$slower)

stats_all <- stats_suite %>%
  summarise(
    unit = unit[1],
    min = min(geomean),
    max = max(geomean),
    geomean = geometric.mean(geomean),
    num_benchmarks = sum(num_benchmarks),
    .groups = "drop")

out("<h2>Summary Over All Benchmarks</h2>")

data_chg <- stats %>%
  filter(commitid == change_hash6) %>%
  select(commitid, exe, suite, bench, ratio,
         varvalue, cores, inputsize, extraargs) %>%
  droplevels()

data_chg_slow <- data_chg %>%
  left_join(stats_suite, by = c("exe", "suite")) %>%
  filter(commitid == change_hash6) %>%
  droplevels()

p <- compare_runtime_ratio_of_suites_plot(
  data_chg_slow,
  slower_runtime_ratio, faster_runtime_ratio,
  fast_color, slow_color, color)
ggsave('overview.svg', p, "svg", output_dir, width = 4.5, height = 2.5, units = "in")
ggsave('overview.png', p, "png", output_dir, width = 4.5, height = 2.5, units = "in")

out('<img src="', output_dir, '/overview.svg">')

out('<dl class="row">
  <dt class="col-sm-3">Number of Benchmarks</dt>
  <dd class="col-sm-8">', stats_all$num_benchmarks, '</dd>

  <dt class="col-sm-3">Geometric Mean</dt>
  <dd class="col-sm-8">', round(stats_all$geomean, 3), ' (min. ', r2(stats_all$min),
  ', max. ', r2(stats_all$max), ')</dd>
</dl>')



if (nrow(not_in_both) > 0) {
  nib <- not_in_both %>%
    select(commitid, exe, suite, bench,
           varvalue, cores, inputsize, extraargs)
  out("<h3>Changes in Benchmark Set</h3>")
  library(xtable)
  str <- print(xtable(nib), type="html",
               print.results=FALSE,
               html.table.attributes = getOption("xtable.html.table.attributes", ""))
  out(str)
}

out("<h2>Benchmark Performance</h2>")



perf_diff_table <- function(norm, stats) {
# e <- "TruffleSOM-graal-bc"

row_count <- 0
  
for (e in levels(norm$exe)) {         data_e <- norm   %>% filter(exe == e)   %>% droplevels()
  for (s in levels(data_e$suite)) {   data_s <- data_e %>% filter(suite == s) %>% droplevels()
    out("<h3>", s, "</h3>")
    out('<div class="title-executor">Executor: ', e, "</div>")

    out('<table class="table table-sm benchmark-details">')
    out('<thead><tr>
<th scope="col"></th>
<th scope="col"></th>
<th scope="col" title="Number of Samples">#M</th>
<th scope="col">median in ', levels(data_s$unit), '</th>
<th scope="col">change in %</th>
<th scope="col"></th>
</tr></thead>')

    for (b in levels(data_s$bench)) { data_b <- data_s %>% filter(bench == b) %>% droplevels()
      for (v in levels(data_b$varvalue)) {   data_v  <- data_b %>% filter(varvalue == v)   %>% droplevels()
      for (c in levels(data_v$cores)) {      data_c  <- data_v %>% filter(cores == c)      %>% droplevels()
      for (i in levels(data_c$inputsize)) {  data_i  <- data_c %>% filter(inputsize == i)  %>% droplevels()
      for (ea in levels(data_i$extraargs)) { data_ea <- data_i %>% filter(extraargs == ea) %>% droplevels()

        args <- ""
        if (length(levels(data_b$varvalue))  > 1) { args <- paste0(args, v) }
        if (length(levels(data_v$cores))     > 1) { args <- paste0(args, c) }
        if (length(levels(data_c$inputsize)) > 1) { args <- paste0(args, i) }
        if (length(levels(data_i$extraargs)) > 1) { args <- paste0(args, ea) }
        if (nchar(args) > 0) {
          args <- paste0('<span class="all-args">', args, '</span>')
        }

        # capture the beginning of the path but leave the last element of it
        # this regex is also used in render.js's renderBenchmark() function
        cmdline <- str_replace_all(data_i$cmdline[[1]], "^([^\\s]*)((?:\\/\\w+)\\s.*$)", ".\\2")

        stats_b <- stats %>%
          ungroup() %>%
          filter(bench == b, suite == s, exe == e, varvalue == v, cores == c, inputsize == i, extraargs == ea, commitid == change_hash6) %>%
          droplevels()

        if (nrow(stats_b) > 0) {
          out('<tr>')
          out('<th scope="row">',  b, args, '</th>')
          out('<td>')
          p <- small_inline_comparison(data_ea)
          img_file <- paste0('inline-', row_count, '.svg')
          ggsave(img_file, p, "svg", output_dir, width = 3.5, height = 0.4, units = "in")
          out('<img src="', output_dir, '/', img_file, '">')
          
          row_count <- row_count + 1
          out('</td>')

          out('<td class="stats-samples">', stats_b$samples, '</td>')
          out('<td><span class="stats-median" title="median">', r2(stats_b$median), '</span></td>')
          out('<td><span class="stats-change" title="change over median">', pro(stats_b$change_m), '</span></td>')
          out('<td><button type="button" class="btn btn-sm" data-toggle="popover" data-content="<code>', cmdline, '</code>">',
             '</button></td>');
          out('</tr>')
        } else {
          out('<tr>')
          out('<th scope="row">',  b, '</th><td colspan="4">missing in one of the data sets</td>')
          out('</tr>')
        }
      } } } }
    }

    out('</table>')
  }
}
}

perf_diff_table(norm, stats)


execs <- levels(peak$exe)
exec_name <- str_replace_all(execs, c("-jit" = "", "-interp" = ""))
exec_name <- union(exec_name, exec_name)

exe_type <- function(data) {
  # print(data)
  ifelse(grepl("-jit", data), "jit", ifelse(grepl("-interp", data), "interp", "other"))
}

# The cross comparison is designed for setups where there are two clearly
# different sets of experiments. The current heuristic assumes that
# interpreter (-interp) and jit-compiling (-jit) VMs are among the executors,
# which without these name parts, form a set of two distinct names.
if (length(exec_name) == 2) {
  out("<h2>Cross Comparison</h2>\n")

  base_exe <- exec_name[[1]]
  out("<p>Baseline: ", base_exe, "</p>")

  peak_comp <- peak %>%
    transform(exe_type = exe_type(exe))
  peak_comp$exe_type <- factor(peak_comp$exe_type)

  base_comp <- peak_comp %>%
    filter(commitid == change_hash6, grepl(base_exe, exe)) %>%
    group_by(exe_type, suite, bench,
             varvalue, cores, inputsize, extraargs,
             commitid) %>%
    summarise(base_mean = mean(value),
              base_median = median(value),
              .groups = "drop")

  norm_comp <- peak_comp %>%
    filter(commitid == change_hash6) %>%
    left_join(base_comp,
              by = c("exe_type", "suite", "bench",
                     "varvalue", "cores", "inputsize", "extraargs",
                     "commitid")) %>%
    group_by(exe_type, suite, bench,
             varvalue, cores, inputsize, extraargs,
             commitid) %>%
    transform(ratio_mean = value / base_mean,
              ratio_median = value / base_median)

  stats_comp <- norm_comp %>%
    group_by(commitid, exe, suite, bench,
             varvalue, cores, inputsize, extraargs) %>%
    filter(is.na(warmup) | iteration >= warmup) %>%
    calculate_stats() %>%
      ## Drop the things that don't have matching results
      filter(!is.na(ratio)) %>%
      droplevels()

  perf_diff_table(norm_comp %>% filter(!grepl(base_exe, exe)), stats_comp)
}


out('<h2>Warmup Behavior</h2>')

out('<p>',
   'This section excludes all interpreter-only and startup benchmarks.',
   '</p>')


# e <- "TruffleSOM-graal"
# s <- "micro-steady"
# b <- "Mandelbrot"

row_count <- 0

for (e in levels(warmup$exe)) {
  data_e <- warmup %>% filter(exe == e) %>% droplevels()

  for (s in levels(data_e$suite)) {
    data_s <- data_e %>% filter(suite == s) %>% droplevels()

    for (b in levels(data_s$bench)) {
      data_b <- data_s %>% filter(bench == b) %>% droplevels()

      for (v in levels(data_b$varvalue)) {         data_v  <- data_b %>% filter(varvalue == v)   %>% droplevels()
        for (c in levels(data_v$cores)) {          data_c  <- data_v %>% filter(cores == c)      %>% droplevels()
          for (i in levels(data_c$inputsize)) {    data_i  <- data_c %>% filter(inputsize == i)  %>% droplevels()
            for (ea in levels(data_i$extraargs)) { data_ea <- data_i %>% filter(extraargs == ea) %>% droplevels()
              out('<div><span class="warmup-benchmark">', b, '</span><span class="warmup-suite">', s, '</span><span class="warmup-exe">', e, '</span>')
              args <- ""
              if (length(levels(data_b$varvalue))  > 1) { args <- paste0(args, v) }
              if (length(levels(data_v$cores))     > 1) { args <- paste0(args, c) }
              if (length(levels(data_c$inputsize)) > 1) { args <- paste0(args, i) }
              if (length(levels(data_i$extraargs)) > 1) { args <- paste0(args, ea) }
              if (nchar(args) > 0) {
                out('<span class="all-args">', args, '</span>')
              }

              out('<div class="warmup-plot">')
              p <- warmup_plot(data_ea, b, s, e)
              
              img_file <- paste0('warmup-', row_count, '.svg')
              ggsave(img_file, p, "svg", output_dir, width = 6, height = 2.5, units = "in")
              out('<img src="', output_dir, '/', img_file, '">')
              
              row_count <- row_count + 1
              
              out('</div></div>')
            }
          }
        }
      }
    }
  }
}

time <- timing.stop()

time <- format(time, digits = 1)
out('<div class="meta-run-time">Run time of Report: ', time, '</div>')
cat(paste0('Run time of Report: ', time, '\n'))
close(output_file_connection)
