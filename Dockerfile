FROM postgres:15-bookworm
# this allows the setup to ignore all of the ubuntu OS setup
# thats not needed for this docker image (Time Zone for example)
ARG DEBIAN_FRONTEND=noninteractive

# tools needed for docker setup
RUN apt-get update && apt-get install -y apt-utils curl bash sudo

ENV TZ=UTC
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# Add Node.js repo
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash -

# Node.js, PostgreSQL, headers for R packages
RUN apt-get update && apt-get install -y \
    build-essential nodejs \
    libfontconfig1-dev \
    libpq-dev

# Copy only package.json to enable caching
COPY ./package.json ./package-lock.json /project/

# Set the working dir to the project & install and compile all dependency
WORKDIR /project/

RUN SKIP_COMPILE=true npm ci --ignore-scripts=false --foreground-scripts

ENV POSTGRES_PASSWORD=docker
ENV POSTGRES_USER=docker

# Basic Configuration
ENV RDB_USER=docker
ENV RDB_PASS=docker
ENV RDB_DB=docker
ENV REFRESH_SECRET=refresh

# open TCP/Project port
EXPOSE 33333

# Generate Script to start the image
RUN echo 'echo Starting ReBenchDB\n\
docker-entrypoint.sh postgres &\n\
DEV=true npm run start' > ./start-server.sh

# all of the project files will be copyed to a new dir called project
COPY . /project

RUN npm run compile

CMD ["bash", "./start-server.sh" ]
