FROM ubuntu:22.04
# this allows the setup to ignore all of the ubuntu OS setup
# thats not needed for this docker image (Time Zone for example)
ARG DEBIAN_FRONTEND=noninteractive

# tools needed for docker setup
RUN apt-get update && apt-get install -y apt-utils curl bash

# Add Node.js repo
RUN curl -sL https://deb.nodesource.com/setup_18.x | bash -

# R, Node.js, PostgreSQL, headers for R packages
RUN apt-get install -y \
    r-base build-essential nodejs \
    postgresql \
    libfontconfig1-dev \
    libpq-dev

# all of the project files will be copyed to a new dir called project
COPY . /project

# Installing R libraries
RUN Rscript /project/src/stats/install.R

# Set the working dir to the project & install and compile all dependency
WORKDIR /project/
RUN npm install .
RUN npm run compile


#CMD ["service","postgresql", "start" ]


# postgres port
# EXPOSE 5432

# open TCP/Project port
EXPOSE 33333

