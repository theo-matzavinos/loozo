#!/bin/sh
# Runs one browser or AOT build step while holding a machine-wide lock, so runs from different
# checkouts queue instead of competing for the CPU and the fixed server ports. The step runs in
# this process and holds the lock until it exits, so a cancelled Playwright run keeps it through
# its teardown. Node doesn't pass the descriptor to its children, so a server left behind by a
# killed run doesn't hold it.
set -eu

lock="${XDG_RUNTIME_DIR:-/tmp}/origami-gate.lock"

exec 9>>"$lock"

if ! flock --nonblock 9; then
  echo "origami gate: waiting for $(cat "$lock")" >&2

  # Waits in the background, because a signal to this shell interrupts `wait` but not a foreground
  # command, so cancelling a queued step doesn't start it later. The traps stay until `exec`, which
  # resets them for the step.
  helper=""
  trap 'kill $helper 2> /dev/null || true; exit 130' INT
  trap 'kill $helper 2> /dev/null || true; exit 143' TERM
  flock 9 &
  helper=$!
  wait $helper
fi

printf "%s %s: %s\n" "$(date +%T)" "$PWD" "$*" > "$lock"

exec "$@"
