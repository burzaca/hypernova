#!/bin/bash
# run-worker.sh <opus|free> <taskfile> <logfile>
# Runs a headless worker agent against the HYPERNOVA repo with the task file as its prompt.
set -u
ROUTE="${1:?route}"; TASK="${2:?task file}"; LOG="${3:?log file}"
cd /home/hermes/projects/hypernova || exit 2
PROMPT="$(cat "$TASK")
---
WORKING DIRECTORY: /home/hermes/projects/hypernova (cd there; use these exact relative paths).
Write the file(s) assigned to you and NOTHING else. Do not create extra files, do not edit
docs/, do not touch other workers' files, do not run git."
case "$ROUTE" in
  opus) PROMPT="$PROMPT" bash -ic 'claude-medium --yolo -z "$PROMPT"' > "$LOG" 2>&1 ;;
  free) PROMPT="$PROMPT" bash -ic 'free-model --yolo -z "$PROMPT"' > "$LOG" 2>&1 ;;
  *) echo "unknown route $ROUTE"; exit 2 ;;
esac
echo "exit=$? route=$ROUTE task=$TASK" >> "$LOG"
