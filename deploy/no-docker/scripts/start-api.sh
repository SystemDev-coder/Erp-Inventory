#!/bin/sh
set -eu

if [ -f /etc/erp-inventory/server.env ]; then
  set -a
  . /etc/erp-inventory/server.env
  set +a
fi

cd /opt/erp-inventory/releases/current/server
exec node dist/server.js

