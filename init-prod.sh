#!/bin/sh
# chkconfig: 2345 95 20
# description: statsd
# processname: node

/usr/local/statsd/init.js 'config_prod.js' "$@"
