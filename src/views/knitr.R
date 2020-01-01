#!/usr/bin/env Rscript
library(rmarkdown)
# library(knitr)
args <- commandArgs(trailingOnly = TRUE)
# This is what we used to use
# result_file <- knit2html(args[1], args[2])

# Now, they suggest this:
render(args[1], "html_fragment", args[2],
       output_dir = args[3],
       intermediates_dir = args[4], knit_root_dir = args[5],
       output_options = list(self_contained=FALSE),
       params = list(
         baseline = args[6],
         change = args[7],
         baseline_color = args[8],
         change_color = args[9],
         db_name = args[10],
         db_user = args[11],
         db_pass = args[12],
         lib_dir = args[13]
       ),
       runtime = "static", clean = TRUE)
