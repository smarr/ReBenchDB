#!/usr/bin/env Rscript
library(rmarkdown)
# library(knitr)
args <- commandArgs(trailingOnly = TRUE)
# This is what we used to use
# result_file <- knit2html(args[1], args[2])

# Now, they suggest this:
render(args[1], "html_fragment", args[2],
       intermediates_dir = args[3], knit_root_dir = args[4],
       output_options = list(self_contained=FALSE),
       params = list(
         baseline = args[5],
         change = args[6],
         baselineColor = args[7],
         changeColor = args[8]
       ),
       runtime = "static", clean = TRUE)
