#!/usr/bin/env bash

set -euo pipefail

if [[ $# -ne 1 ]]; then
  printf 'Usage: %s WP-XX\n' "$0" >&2
  exit 2
fi

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
manifest="$repo_root/work-packages/manifest.json"
package_id="$1"

if ! jq -e --arg id "$package_id" '.packages[] | select(.id == $id)' "$manifest" >/dev/null; then
  printf 'FAIL  unknown work package: %s\n' "$package_id"
  exit 1
fi

failures=0
while IFS= read -r dependency; do
  evidence="$repo_root/docs/work-package-evidence/$dependency.md"
  if [[ ! -f "$evidence" ]]; then
    printf 'FAIL  %s requires missing evidence %s\n' "$package_id" "$evidence"
    failures=$((failures + 1))
  elif ! grep -Eq '^status: "?PASS"?$' "$evidence"; then
    printf 'FAIL  %s dependency %s is not PASS\n' "$package_id" "$dependency"
    failures=$((failures + 1))
  else
    printf 'PASS  dependency %s\n' "$dependency"
  fi
done < <(jq -r --arg id "$package_id" '.packages[] | select(.id == $id) | .dependsOn[]?' "$manifest")

if (( failures > 0 )); then
  exit 1
fi

printf 'READY %s\n' "$package_id"
