#!/usr/bin/env Rscript
#
# SOMns Performance Comparison Report
args <- if (Sys.getenv("RSTUDIO") == "1") {
 c("test.html",
   "~/Projects/ReBenchDB/tmp/rstudio/",
   "~/Projects/ReBenchDB/src/views/",
   "/static/reports",
   "d9dda54b519e3a87351768878afb2c7950036260",  #"493721",
   "5fa4bdb749d3b4a621362219420947e00e108580",  #"d3f598",
   "rdb_smde", # NA,  # "rdb_sm1"
   "", # NA,
   "", # NA,
   ""  # "from-file;~/Projects/ReBenchDB/tmp/TruffleSOM-380.qs;~/Projects/ReBenchDB/tmp/TruffleSOM-381.qs"
 )
} else {
  commandArgs(trailingOnly = TRUE)
}

if (length(args) < 10 | args[[1]] == '--help') {
  cat("Performance Comparison Report

Usage: somns.R outputFile outputDir baselineHash changeHash baselineColor changeColor dbName dbUser dbPass [extraCmd]

  outputFile       the name for the HTML file that is produced
  outputDir        the name for the folder with images produced
  libDir           the path where common.R can be found
  staticBase       the base url for static resource, e.g., images
  baselineHash     the commit hash of the baseline
  changeHash       the commit hash of the change

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
static_base    <- args[[4]]
baseline_hash  <- args[[5]]
change_hash    <- args[[6]]
db_name        <- args[[7]]
db_user        <- args[[8]]
db_pass        <- args[[9]]
extra_cmd      <- args[[10]]

# Load Libraries
source(paste0(lib_dir, "/common.R"), chdir=TRUE)
suppressMessages(library(dplyr))
library(stringr)

baseline_hash6 <- substr(baseline_hash, 1, 6)
change_hash6 <- substr(change_hash, 1, 6)
cmds <- str_split(extra_cmd, ";")[[1]]


## Further configuration
fast_color <- "#e4ffc7"
slow_color <- "#ffcccc"
faster_runtime_ratio <- 0.95
slower_runtime_ratio <- 1.05

output_url <- paste0(static_base, '/', output_dir)

# Start Timing of Report Generation
timing.start()

## File Output
output_file_connection <- NULL

if (Sys.getenv("RSTUDIO") == "1") {
  out <- function(...) { writeLines(c(...), sep = "") }
} else {
  out <- function(...) {
    writeLines(c(...), con = output_file_connection, sep = "")
  }
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

exes_colors <- setNames(
  c("#729fcf", "#e9b96e", "#8ae234", "#ad7fa8", "#fcaf3e", "#ef2929", "#fce94f")[1:length(levels(result$exe))],
  levels(result$exe))

exes_colors_light <- setNames(
  c("#97c4f0", "#efd0a7", "#b7f774", "#e0c0e4", "#ffd797", "#f78787", "#fffc9c")[1:length(levels(result$exe))],
  levels(result$exe))

chg_colors <- setNames(
  c("#729fcf", "#e9b96e"),
  c(baseline_hash6, change_hash6))

chg_colors_light <- setNames(
  c("#97c4f0", "#efd0a7"),
  c(baseline_hash6, change_hash6))

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
  out('<div class="compare">')
  out("<h3>Issue with Unexpected Data</h3>",
      "<p>The data provided for baseline and change does not seem to have a common benchmarks/executors.</p>\n",
      "<p>This is known to happen for instance, when benchmarks or parameters are changed, or executors renamed.</p>\n")
  out('</div>')
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

data_chg <- stats %>%
  filter(commitid == change_hash6) %>%
  select(commitid, exe, suite, bench, ratio,
         varvalue, cores, inputsize, extraargs) %>%
  droplevels()

data_chg_slow <- data_chg %>%
  left_join(stats_suite, by = c("exe", "suite")) %>%
  filter(commitid == change_hash6) %>%
  droplevels()

# Identify possible comparison on the data of the change.
# Within the change data, there may be different executors, which are worth
# comparing.

restrict_to_change_data <- function(data) {
  data %>%
    ungroup() %>%
    filter(commitid == change_hash6) %>%
    select(!commitid) %>%
    droplevels()
}

change_data <- result %>%
  restrict_to_change_data()

exes_and_suites <- change_data %>%
  select(c(exe, suite)) %>%
  unique()

suites_for_comparison <- exes_and_suites %>%
  group_by(suite) %>%
  count() %>%
  filter(n > 1) %>%
  droplevels()

## Generate Navigation

out('<div class="container-fluid">')
out('<div class="row flex-xl-nowrap">')


out('<nav class="col-2 compare">\n',
    '  <a href="#overview">Result Overview</a>')

for (e in levels(norm$exe)) {
  data_e <- norm   %>% filter(exe == e)   %>% droplevels()
  if (length(levels(data_e$suite)) > 0) {
    out('<nav><span>', e, '</span>\n')
    
    for (s in levels(data_e$suite)) {
      data_s <- data_e %>% filter(suite == s) %>% droplevels()
      out('<a href="#', s, '-', e, '">', s, '</a>\n')
    }
    
    out('</nav>\n')
} }


if (nrow(suites_for_comparison) > 0) {
  out('<a href="#exe-comparisons">Executor Comparisons</a>\n')
  out('<nav>\n')
  
  for (s in suites_for_comparison$suite) {
    out('<a href="#exe-comp-', s ,'">', s ,'</a>\n')
  }
  
  out('</nav>\n')
}
out('</nav>\n')


out('<main class="col-8" role="main">')


## Generate Overview Plot
p <- compare_runtime_ratio_of_suites_plot(
  data_chg_slow,
  slower_runtime_ratio, faster_runtime_ratio,
  fast_color, slow_color, chg_colors)
ggsave('overview.svg', p, "svg", output_dir, width = 4.5, height = 2.5, units = "in")
ggsave('overview.png', p, "png", output_dir, width = 4.5, height = 2.5, units = "in")


out('<h2 id="overview">Result Overview</h2>')

out('<img src="', output_url, '/overview.svg">')

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

perf_diff_table_es <- function(data_es, stats_es, warmup_es, start_row_count, group, colors, colors_light) {
  group_col <- enquo(group)
  row_count <- start_row_count

  out('<table class="table table-sm benchmark-details">')
  out('<thead><tr>
<th scope="col"></th>
<th scope="col"></th>
<th scope="col" title="Number of Samples">#M</th>
<th scope="col">median in ', levels(data_es$unit), '</th>
<th scope="col">change in %</th>
<th scope="col"></th>
</tr></thead>')

  # b <- "DeltaBlue"
  # data_ea <- data_b

  for (b in levels(data_es$bench)) { data_b <- data_es %>% filter(bench == b) %>% droplevels()
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

    stats_b <- stats_es %>%
      ungroup() %>%
      filter(bench == b, varvalue == v, cores == c, inputsize == i, extraargs == ea) %>%
      droplevels()

    if ("commitid" %in% colnames(stats_b)) {
      stats_b <- stats_b %>%
        filter(commitid == change_hash6) %>%
        droplevels()
    }

    group_size <- (data_ea %>% select(!!group_col) %>% unique() %>% count())$n

    if (nrow(stats_b) > 0) {
      out('<tr>')
      out('<th scope="row">',  b, args, '</th>')
      out('<td>')
      p <- small_inline_comparison(data_ea, !!group_col, colors, colors_light)
      img_file <- paste0('inline-', row_count, '.svg')
      ggsave(img_file, p, "svg", output_dir, width = 3.5, height = 0.12 + 0.14 * group_size, units = "in")
      out('<img src="', output_url, '/', img_file, '">')

      row_count <- row_count + 1
      out('</td>\n')

      if (nrow(stats_b) == 1) {
        out('<td class="stats-samples">', stats_b$samples, '</td>\n')
        out('<td><span class="stats-median" title="median">', r2(stats_b$median), '</span></td>\n')
        out('<td><span class="stats-change" title="change over median">', pro(stats_b$change_m), '</span></td>\n')
        out('<td><button type="button" class="btn btn-sm" data-toggle="popover" data-content="<code>', cmdline, '</code>"></button>\n')
      } else {
        exes <- levels(stats_b$exe)
        common_start <- common_string_start(exes)

        out('<td class="stats-samples">')
        first <- TRUE
        for (e in exes) {
          if (first) {
            first <- FALSE
          } else {
            out('<br>\n')
          }
          out(substring(e, common_start) , " ", filter(stats_b, exe == e)$samples)
        }
        out('</td>\n')

        out('<td><span class="stats-median" title="median">')
        first <- TRUE
        for (e in exes) {
          if (first) {
            first <- FALSE
          } else {
            out('<br>\n')
          }
          out(r2(filter(stats_b, exe == e)$median))
        }
        out('</span></td>\n')


        out('<td>')
        first <- TRUE
        for (e in exes) {
          if (first) {
            first <- FALSE
          } else {
            out('<br>\n')
          }
          out('<span class="stats-change" title="change over median">', pro(filter(stats_b, exe == e)$change_m), '</span>')
        }
        out('</td>\n')

        out('<td><button type="button" class="btn btn-sm" data-toggle="popover" data-content="<code>', cmdline, '</code>"></button>\n')
      }

      warmup_ea <- warmup_es %>%
        filter(bench == b, varvalue == v, cores == c, inputsize == i, extraargs == ea) %>%
        droplevels()

      if (nrow(warmup_ea) > 0) {
        img_file <- paste0('warmup-', row_count, '.svg')
        p <- warmup_plot(warmup_ea, !!group_col, colors)
        ggsave(img_file, p, "svg", output_dir, width = 6, height = 2.5, units = "in")
        out('<button type="button" class="btn btn-sm btn-light btn-expand" data-img="', output_url, '/', img_file, '"></button>\n')
      }

      out('</td>');
      out('</tr>\n')
    } else {
      out('<tr>')
      out('<th scope="row">',  b, '</th><td colspan="4">missing in one of the data sets</td>\n')
      out('</tr>')
    }
    } } } }
  }

  out('</table>')
  row_count
}

perf_diff_table <- function(norm, stats, start_row_count) {
  # e <- "TruffleSOM-graal-bc"

  row_count <- start_row_count

  for (e in levels(norm$exe)) {         data_e <- norm   %>% filter(exe == e)   %>% droplevels()
    for (s in levels(data_e$suite)) {   data_s <- data_e %>% filter(suite == s) %>% droplevels()
      # e <- "TruffleSOM-graal"
      # s <- "macro-steady"
      out('<h3 id="', s, '-', e, '">', s, '</h3>')
      out('<div class="title-executor">Executor: ', e, "</div>")

      stats_es <- stats %>%
        ungroup() %>%
        filter(exe == e, suite == s) %>%
        droplevels()

      warmup_es <- warmup %>%
        ungroup() %>%
        filter(exe == e, suite == s) %>%
        droplevels()

      row_count <- perf_diff_table_es(
        data_s, stats_es, warmup_es,
        row_count, commitid, chg_colors, chg_colors_light)
    }
  }
  row_count
}

row_count <- perf_diff_table(norm, stats, 0)


## Output the Executor Comparison


if (nrow(suites_for_comparison) > 0) {
  out('<h2 id="exe-comparisons">Executor Comparisons</h2>\n')

  for (s in suites_for_comparison$suite) {
    # s <- "macro-startup"
    out('<h3 id="exe-comp-', s ,'">', s ,'</h3>\n')

    change_s <- change_data %>%
      filter(suite == s) %>%
      droplevels()
    exes <- sort(levels(change_s$exe))
    baseline_exe <- exes[[1]]

    out("<p>Baseline: ", baseline_exe, "</p>")


    warmup_s <- warmup %>%
      restrict_to_change_data() %>%
      filter(suite == s) %>%
      droplevels()

    peak_s <- peak %>%
      restrict_to_change_data() %>%
      filter(suite == s) %>%
      droplevels()

    base_s <- peak_s %>%
      filter(exe == baseline_exe) %>%
      group_by(bench,
               varvalue, cores, inputsize, extraargs) %>%
      summarise(base_mean = mean(value),
                base_median = median(value),
                .groups = "drop")

    norm_s <- peak_s %>%
      left_join(base_s, by = c(
        "bench", "varvalue", "cores", "inputsize", "extraargs")) %>%
      group_by(bench, varvalue, cores, inputsize, extraargs) %>%
      transform(ratio_mean = value / base_mean,
                ratio_median = value / base_median)


    stats_s <- norm_s %>%
      group_by(exe, bench,
               varvalue, cores, inputsize, extraargs) %>%
      filter(is.na(warmup) | iteration >= warmup) %>%
      calculate_stats()

    not_in_both_s <- stats_s %>%
      filter(is.na(ratio)) %>%
      droplevels()

    stats_s <- stats_s %>%
      filter(!is.na(ratio)) %>%
      droplevels()

    p <- ggplot(stats_s, aes(ratio, exe, fill=exe)) +
      geom_vline(aes(xintercept=1), colour="#999999", linetype="solid") +
      geom_vline(aes(xintercept=slower_runtime_ratio), colour="#cccccc", linetype="dashed") +
      geom_vline(aes(xintercept=faster_runtime_ratio), colour="#cccccc", linetype="dashed") +
      geom_boxplot(aes(colour = exe),
                   outlier.size = 0.9,
                   outlier.alpha = 0.6) +
      stat_summary(fun = negative_geometric.mean,
                   size = 1, colour = "#503000", geom = "point") +
      scale_x_log10() +
      scale_y_discrete(limits = rev) +
      ylab("") +
      #coord_cartesian(xlim=c(0.5, 2.5)) +
      theme_simple(8) +
      scale_color_manual(values = exes_colors) +
      scale_fill_manual(values = exes_colors_light) +
      # scale_fill_manual(breaks=c("slower", "faster", "indeterminate"),
      #                   values=c(slow_color, fast_color, NA)) +
      theme(legend.position = "none")

    ggsave(paste0('overview.', s, '.svg'), p, "svg", output_dir, width = 4.5, height = 2.5, units = "in")
    ggsave(paste0('overview.', s, '.png'), p, "png", output_dir, width = 4.5, height = 2.5, units = "in")

    out('<img src="', output_url, '/overview.', s, '.svg">')

    row_count <- perf_diff_table_es(
      norm_s, stats_s, warmup_s, row_count + 1, exe, exes_colors, exes_colors_light)
  }

}

time <- timing.stop()

time <- format(time, digits = 1)
out('<div class="meta-run-time">Run time of Report: ', time, '</div>')

out('</main>')
out('</div></div>') # closing class="row flex-nowrap" and class="container-fluid"

cat(paste0('Run time of Report: ', time, '\n'))
close(output_file_connection)
