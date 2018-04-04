# -------------------------#
# Ubuntu 14.04 Setup       #
# -------------------------#
FROM ubuntu:16.04
#FROM alpine:3.6   --  alpine does NOT support fsevents node mod !!!

# This is the release of Traefik to pull in.
ENV NODEJS_VERSION="v0.8.3"


# This is the release of https://github.com/hashicorp/docker-base to pull in order
# to provide HashiCorp-built versions of basic utilities like dumb-init and gosu.
#ENV DOCKER_BASE_VERSION="17.05.0-r0"
ENV DOCKER_BASE_VERSION="0.0.4"

# Setup Container
RUN apt-get update && \
    apt-get install -y build-essential libssl-dev && \
    apt-get install -y curl && \
    apt-get install -y net-tools dnsutils && \
    apt-get install -y sudo && \
    apt-get install -y vim && \
    apt-get install -y wget && \
    echo ':colorscheme koehler' > /root/.vimrc

RUN mkdir mongo_oplog

RUN mkdir /tmp/build && \
    cd /tmp/build && \
    curl -sL https://deb.nodesource.com/setup_4.x | bash && \
    apt install -yq nodejs


RUN mkdir -p /opt/oplog_app
RUN rm -rf /root/.gnupg
RUN rm -rf /tmp/build

# Create a oplog user and group
RUN addgroup oploguser && \
    adduser --disabled-password --ingroup oploguser oploguser
RUN echo "oploguser    ALL=(ALL) NOPASSWD: ALL" >> /etc/sudoers

# Add oplog_app to /opt
ADD bin/oplog_app /usr/local/bin
ADD src/* /opt/oplog_app/src/
ADD etc/* /opt/oplog_app/etc/
ADD package.json /opt/oplog_app/

# Add oplog_app.json to /etc
ADD etc/* /etc/

# Add mongo_oplogp to /opt
ADD mongo_oplog/* /opt/mongo_oplog/

# Run the npm installer
RUN ls -al /opt/mongo_oplog/* && \
    cd /opt/mongo_oplog && \
    npm install
RUN ls -al /opt/oplog_app && \
    cd /opt/oplog_app && \
    npm install

RUN chmod +x /opt/* && \
    chmod +x /usr/local/bin/* && \
    chown -R oploguser:oploguser /opt/oplog_app && \
    chown -R oploguser:oploguser /opt/mongo_oplog && \
    chown -R oploguser:oploguser /usr/local/bin && \
    chown oploguser:oploguser /etc/oplog_app.json

# Fire up the app
CMD ["/usr/local/bin/oplog_app"]
