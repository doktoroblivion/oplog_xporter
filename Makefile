#
# Makefile
#

# Update with version of github.com/cayasso/mongo-oplog you are using, this should be cloned to a directory
# peer to this one.
MONGO_OPLOG_VERSION?=2.1.0

default: init docker_build

clean: kill
	$(eval IMAGE_IDS=$(shell docker images -a | grep 'oplog_xporter' | grep -v CONTAINER | sed 's/  */ /g' | cut -d' ' -f3))
	$(eval IMAGE_IDS+=$(shell docker images -a | grep 'none' | grep -v CONTAINER | sed 's/  */ /g' | cut -d' ' -f3))
	docker rmi -f $(IMAGE_IDS) || true

init:
	cd .. && ln -sf mongo-oplog-${MONGO_OPLOG_VERSION} mongo_oplog

docker_build: kill
	docker build -t oplog_xporter .

kill:
	docker rm -f oplog_xporter || true

run:
	docker run -it --rm --name oplog_tranporter \
		oplog_xporter

.PHONY: docker_build run kill
