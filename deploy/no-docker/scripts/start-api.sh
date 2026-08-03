#!/bin/sh
set -eu

if [ -f /srv/pms-bench/backend/.env ]; then
  set -a
  . /srv/pms-bench/backend/.env
  set +a
fi

cd /srv/pms-bench/backend
exec node dist/server.js
