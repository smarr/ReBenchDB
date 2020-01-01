## Prepare R installation with the known required libraries

load_and_install_if_necessary <- function(package_name) {
  if (!suppressPackageStartupMessages(library(package_name, character.only=TRUE, logical.return=TRUE))) {
    cat(paste0("Package ", package_name, " not found. Will install it."))
    install.packages(package_name)
    library(package_name, character.only=TRUE)
  }
}

load_and_install_if_necessary("DBI")
load_and_install_if_necessary("dplyr")
load_and_install_if_necessary("ggplot2")
load_and_install_if_necessary("boot")
load_and_install_if_necessary("ggstance")
