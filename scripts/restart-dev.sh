#!/usr/bin/env bash
# Restarts the dev servers cleanly. Kills only the processes that listen on the
# app ports or that run this project's dev runner, so an orphaned child left by
# an earlier start cannot keep serving stale code on the same port.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

listener_pids() {
  ss -ltnp 2>/dev/null | grep -E ':(3000|4000) ' | grep -oE 'pid=[0-9]+' | cut -d= -f2 | sort -u |
    while read -r pid; do
      cwd=$(readlink "/proc/$pid/cwd" 2>/dev/null) || continue
      [[ "$cwd" == "$ROOT" || "$cwd" == "$ROOT"/* ]] && echo "$pid"
    done
}

runner_pids() {
  for dir in /proc/[0-9]*; do
    pid="${dir#/proc/}"
    [[ "$pid" == "$$" ]] && continue
    # Only touch processes working in this project; the VM hosts other chats.
    cwd=$(readlink "$dir/cwd" 2>/dev/null) || continue
    [[ "$cwd" == "$ROOT" || "$cwd" == "$ROOT"/* ]] || continue
    cmd=$(tr '\0' ' ' < "$dir/cmdline" 2>/dev/null) || continue
    case "$cmd" in
      "node scripts/dev.mjs "* | "node --watch src/index.js "* | *"/vite"*) echo "$pid" ;;
    esac
  done
}

for pid in $(listener_pids) $(runner_pids); do
  kill "$pid" 2>/dev/null
done

for _ in $(seq 1 20); do
  [[ -z "$(listener_pids)" ]] && break
  sleep 0.3
done

if [[ -n "$(listener_pids)" ]]; then
  echo "Ports 3000/4000 are still in use by: $(listener_pids | tr '\n' ' ')" >&2
  exit 1
fi

setsid npm run dev > /tmp/dev.log 2>&1 &
echo $! > /tmp/dev.pid

for _ in $(seq 1 40); do
  if curl -sf -m 2 http://127.0.0.1:4000/api/v1/health > /dev/null 2>&1 &&
    curl -sf -m 2 -o /dev/null http://127.0.0.1:3000/ 2>/dev/null; then
    echo "dev servers ready (api :4000, web :3000)"
    exit 0
  fi
  sleep 0.5
done

echo "dev servers did not become ready; see /tmp/dev.log" >&2
tail -20 /tmp/dev.log >&2
exit 1
