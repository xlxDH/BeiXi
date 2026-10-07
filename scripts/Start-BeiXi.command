#!/bin/sh
cd "$(dirname "$0")" || exit 1
exec ./runtime/bin/node ./launcher.cjs
