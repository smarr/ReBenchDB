# ReBenchDB

[![Build Status](https://travis-ci.com/smarr/ReBenchDB.svg?branch=master)](https://travis-ci.com/smarr/ReBenchDB)
[![Documentation](https://readthedocs.org/projects/rebench/badge/?version=latest)](https://rebench.readthedocs.io/)
[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.1311762.svg)](https://doi.org/10.5281/zenodo.1311762)

ReBenchDB records benchmark results and provides customizable reporting
to track and analyze run-time performance of software programs.
It is used for example to track the performance of multiple language implementations,
including [SOMns](https://github.com/smarr/SOMns) and other implementations
from the [family of Simple Object Machines](https://som-st.github.io/).
[ReBench](https://github.com/smarr/ReBench) is currently the main benchmark
runner to record data for ReBenchDB.

## Goals and Features

ReBenchDB is designed to

- [x] record benchmark measurements
- [-] information about the environment in which the benchmarks were executed
- [-] enable performance tracking over time
- [x] enable performance comparison of experiments
- [-] supports custom reports and performance analyses
- [-] enables data export

(Things marked with [x] are already finished, or partially finished [-])

## Non-Goals

ReBenchDB isn't

- a benchmark runner or benchmarking framework:
  Check [ReBench](https://github.com/smarr/ReBench) if you need one
- a statistics library:
  We currently use R for our statistic needs, but anything outputting HTML would be suitable.

## Installation and Usage

<a id="install"></a>

ReBenchDB is implemented in TypeScript on top of Node.js.
Data is stored in a PostgreSQL database.
Custom reports are executed via a shell script, though, we use R to create
reports.

To ensure that the SVG for plots is generated using a font available in most browers,
the server needs them when generating plots. We currently use Arial as default font.

On Ubuntu, these fonts can be installed with:

```bash
apt install ttf-mscorefonts-installer
```

TODO: write a detailed description on what is required to set things up.

## Support and Contributions

In case you encounter issues,
please feel free to [open an issue](https://github.com/smarr/ReBenchDB/issues/new)
so that we can help.

For contributions, we use the [GitHub flow](https://guides.github.com/introduction/flow/)
of pull requests, discussion, and revisions. For larger contributions,
it is likely useful to discuss them upfront in an issue first.

## Similar Projects

[Codespeed](https://github.com/tobami/codespeed/) "is a web application to monitor
and analyze the performance of your code." We used it for almost 10 years before
starting ReBenchDB. As such it provided a lot of inspiration and at this point,
is a more mature and proven alternative.
