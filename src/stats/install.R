## Prepare R installation with the known required libraries

load_and_install_if_necessary <- function(package_name) {
  if (!suppressPackageStartupMessages(library(package_name, character.only=TRUE, logical.return=TRUE))) {
    cat(paste0("Package ", package_name, " not found. Will install it."))
    install.packages(package_name, repos="https://cloud.r-project.org/")
    library(package_name, character.only=TRUE)
  }
}

load_and_install_if_necessary("dplyr")
load_and_install_if_necessary("stringr")
load_and_install_if_necessary("qs")
load_and_install_if_necessary("svglite")
load_and_install_if_necessary("forcats")
load_and_install_if_necessary("ggplot2")
load_and_install_if_necessary("boot")
load_and_install_if_necessary("xtable")
load_and_install_if_necessary("RPostgres")
load_and_install_if_necessary("DBI")
load_and_install_if_necessary("tidyr")
