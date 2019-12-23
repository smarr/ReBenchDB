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
         baselineColor = args[8],
         changeColor = args[9]
       ),
       runtime = "static", clean = TRUE)
