FROM ubuntu:22.10
# this allows the setup to ignore all of the ubuntu OS setup
# thats not needed for this docker image (Time Zone for example)
ARG DEBIAN_FRONTEND=noninteractive

# tools needed for docker setup
RUN apt-get update && apt-get install -y apt-utils curl bash sudo

# Add Postgres repo
RUN sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list' && \
    wget -qO- https://www.postgresql.org/media/keys/ACCC4CF8.asc | tee /etc/apt/trusted.gpg.d/pgdg.asc &>/dev/null

# Add Node.js repo
RUN curl -sL https://deb.nodesource.com/setup_19.x | bash -

# R, Node.js, PostgreSQL, headers for R packages
RUN apt-get update && apt-get install -y \
    r-base build-essential nodejs \
    postgresql \
    libfontconfig1-dev \
    libpq-dev

# Copy only the install.R to enable caching
RUN mkdir -p /project/src/stats/
COPY ./src/stats/install.R /project/src/stats/

# Installing R libraries
RUN Rscript /project/src/stats/install.R


# Copy only package.json to enable caching
COPY ./package.json ./package-lock.json /project/

# Set the working dir to the project & install and compile all dependency
WORKDIR /project/

RUN npm ci --ignore-scripts .

# Basic Configuration
ENV RDB_USER=docker
ENV RDB_PASS=docker
ENV RDB_DB=rebenchdb
ENV REFRESH_SECRET=refresh

# open TCP/Project port
EXPOSE 33333

# Initialize Database
RUN service postgresql start && \
   sudo -u postgres psql -c "CREATE USER docker with password 'docker';" \
     -c " CREATE DATABASE rebenchdb;" \
     -c "GRANT ALL PRIVILEGES ON DATABASE rebenchdb TO docker;" \
     -c "ALTER USER docker CREATEDB;"

# Generate Script to start the image
RUN echo 'echo Starting ReBenchDB\n\
service postgresql start\n\
DEV=true npm run start' > ./start-server.sh

# all of the project files will be copyed to a new dir called project
COPY . /project

RUN npm run compile

ENV TZ=UTC
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

CMD ["bash", "./start-server.sh" ]
