#!/bin/sh
# Usage: scripts/capture.sh out.png [data-dir] [js-to-run-first]
# Renders the built app to a PNG using an isolated data folder.
OUT=$1; DATA=${2:-$(mktemp -d)}; JS=$3
STRIDE_DATA_DIR="$DATA" STRIDE_CAPTURE="$OUT" STRIDE_CAPTURE_JS="$JS" npx electron . &
PID=$!
for i in $(seq 1 480); do sleep 1; kill -0 $PID 2>/dev/null || exit 0; done
kill $PID
