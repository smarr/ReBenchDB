FROM node:21-bookworm
# this allows the setup to ignore all of the ubuntu OS setup
# thats not needed for this docker image (Time Zone for example)
ARG DEBIAN_FRONTEND=noninteractive

# tools needed for docker setup
RUN apt-get update && apt-get install -y apt-utils bash sudo

ENV TZ=UTC
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# Node.js, PostgreSQL, headers for R packages
RUN apt-get update && apt-get install -y \
    build-essential unzip \
    libfontconfig1-dev \
    libpq-dev

# Copy only package*.json, which are likely unchanged, allowing caching
COPY package.json package-lock.json /project/

# Set the working dir to the project & install and compile all dependency
WORKDIR /project/

RUN SKIP_COMPILE=true npm ci --ignore-scripts=false --foreground-scripts

# copy all files, which likely have changed, and prevent caching
COPY . /project/

RUN npm run compile
