############################################################################
#                                                                          #
#                          RebenchDB Docker File                           #
#                                                                          #
############################################################################
# Version: 1.1   Date: 14/07/2020
# Author: Humphrey Burchell & Stefan Marr

# ubuntu version >=22.04 as of April 20202
FROM ubuntu:latest
# this allows the setup to ignore all of the ubuntu OS setup thats not needed for this docker image (Time Zone for example)
ARG DEBIAN_FRONTEND=noninteractive

# all of the project files will be copyed to a new dir called project
RUN mkdir project/
COPY . project/

# updating OS and Tools needed to do docker setup
RUN apt-get update && apt-get install -y apt-utils && apt-get install -y curl && apt-get install -y bash


# Installing R
RUN apt-get install -y r-base 


# Installing Nodejs (NPM is Included in this install)
# must have at least node 18 hence the bash
RUN curl -sL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs

# Installing build-essential 
RUN apt-get install -y build-essential 

# Installing postgresql
RUN apt-get install -y postgresql

# Installing missing headers for R libraries
RUN apt-get install -y libfontconfig1-dev
RUN apt-get install -y libpq-dev

# Instaling R libraries 
RUN Rscript project/src/stats/install.R

# Set the working dir to the project & install and compile all dependency
WORKDIR /project/
RUN npm install .
RUN npm run compile

# open postgres port
EXPOSE 5432

# open TCP/Project port
EXPOSE 33333

# start database on container run
# this seems to stop ssh into the container so it must be done once inside the container
#CMD ["service","postgresql", "start" ]


# Build the container
# sudo docker build -t *name-the-container* .

# Run the container with ssh
# sudo docker run -p 33333:33333 -i -t *name-the-container*

# once in the container you will need to start the postgres server
# service postgresql start

