#!/bin/bash
set -e

cd "$(dirname "$0")"

exec ./runtime/node ./server.js
