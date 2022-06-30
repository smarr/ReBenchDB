#!/bin/bash
pushd $(dirname "${0}") > /dev/null
BASEDIR=$(pwd -L)
popd > /dev/null

exec Rscript "${BASEDIR}/src/views/somns.R" \
    test.html test.figures "${BASEDIR}/src/views" "" \
    '' '' '' '' '' \
    "from-file;${BASEDIR}/$1;${BASEDIR}/$2"
