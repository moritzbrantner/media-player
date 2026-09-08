#!/usr/bin/env bash

set -euo pipefail

candidate=${1:?candidate checkout is required}
reference=${2:?reference checkout is required}

mkdir -p "$reference/profiles/runtime-profiler"
cp "$candidate/scripts/profile-blue-noise.mjs" "$reference/scripts/profile-blue-noise.mjs"
cp "$candidate/profiles/runtime-profiler/blue-noise.json" "$reference/profiles/runtime-profiler/blue-noise.json"

git -C "$reference" add scripts/profile-blue-noise.mjs profiles/runtime-profiler/blue-noise.json

if git -C "$reference" diff --cached --quiet; then
  exit 0
fi

git -C "$reference" \
  -c user.name='runtime-profiler' \
  -c user.email='runtime-profiler@invalid' \
  commit -m 'chore: attach comparable blue-noise workload'
