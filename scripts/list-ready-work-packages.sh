#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
manifest="$repo_root/work-packages/manifest.json"
ready_count=0

while IFS= read -r package_id; do
  current_evidence="$repo_root/docs/work-package-evidence/$package_id.md"
  if [[ -f "$current_evidence" ]] && grep -Eq '^status: "?PASS"?$' "$current_evidence"; then
    continue
  fi

  ready=1
  while IFS= read -r dependency; do
    dependency_evidence="$repo_root/docs/work-package-evidence/$dependency.md"
    if [[ ! -f "$dependency_evidence" ]] || ! grep -Eq '^status: "?PASS"?$' "$dependency_evidence"; then
      ready=0
      break
    fi
  done < <(jq -r --arg id "$package_id" '.packages[] | select(.id == $id) | .dependsOn[]?' "$manifest")

  if (( ready == 1 )); then
    title="$(jq -r --arg id "$package_id" '.packages[] | select(.id == $id) | .title' "$manifest")"
    gate="$(jq -r --arg id "$package_id" '.packages[] | select(.id == $id) | .gate' "$manifest")"
    printf 'READY  %-7s gate=%-12s %s\n' "$package_id" "$gate" "$title"
    ready_count=$((ready_count + 1))
  fi
done < <(jq -r '.packages | sort_by(.wave, .id)[] | .id' "$manifest")

if (( ready_count == 0 )); then
  printf 'No unfinished work package currently has all dependencies at PASS.\n'
fi
