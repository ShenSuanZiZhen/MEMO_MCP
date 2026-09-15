#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
manifest="$repo_root/work-packages/manifest.json"
failures=0

if ! command -v jq >/dev/null 2>&1; then
  printf 'FAIL  jq is required\n'
  exit 1
fi

if ! jq -e '.version and .packages and (.packages | length == 70)' "$manifest" >/dev/null; then
  printf 'FAIL  manifest must contain exactly 70 packages\n'
  exit 1
fi

duplicates="$(jq -r '.packages[].id' "$manifest" | sort | uniq -d)"
if [[ -n "$duplicates" ]]; then
  printf 'FAIL  duplicate package ids: %s\n' "$duplicates"
  failures=$((failures + 1))
fi

while IFS= read -r package_id; do
  package_file="$repo_root/work-packages/$package_id.md"
  if [[ ! -f "$package_file" ]]; then
    printf 'FAIL  missing %s\n' "$package_file"
    failures=$((failures + 1))
    continue
  fi

  if ! grep -Fqx "id: $package_id" "$package_file"; then
    printf 'FAIL  %s front matter id does not match filename\n' "$package_id"
    failures=$((failures + 1))
  fi

  if ! grep -Fq "./scripts/check-work-package-ready.sh $package_id" "$package_file"; then
    printf 'FAIL  %s missing its readiness command\n' "$package_id"
    failures=$((failures + 1))
  fi

  if ! grep -Fq 'work-packages/00_全局开发约束.md' "$package_file"; then
    printf 'FAIL  %s does not import global constraints\n' "$package_id"
    failures=$((failures + 1))
  fi

  for heading in '## 目标结果' '## 允许修改' '## 禁止和非目标' '## 实施要求' '## 可验证完成结果' '## 衔接输出' '## 停止条件'; do
    if ! grep -Fqx "$heading" "$package_file"; then
      printf 'FAIL  %s missing heading: %s\n' "$package_id" "$heading"
      failures=$((failures + 1))
    fi
  done
done < <(jq -r '.packages[].id' "$manifest")

all_ids="$(jq -r '.packages[].id' "$manifest")"
while IFS=$'\t' read -r package_id dependency; do
  if ! grep -Fqx "$dependency" <<< "$all_ids"; then
    printf 'FAIL  %s references unknown dependency %s\n' "$package_id" "$dependency"
    failures=$((failures + 1))
    continue
  fi

  package_wave="$(jq -r --arg id "$package_id" '.packages[] | select(.id == $id) | .wave' "$manifest")"
  dependency_wave="$(jq -r --arg id "$dependency" '.packages[] | select(.id == $id) | .wave' "$manifest")"
  if (( dependency_wave >= package_wave )); then
    printf 'FAIL  %s wave %s must be after dependency %s wave %s\n' "$package_id" "$package_wave" "$dependency" "$dependency_wave"
    failures=$((failures + 1))
  fi
done < <(jq -r '.packages[] | .id as $id | .dependsOn[]? | [$id, .] | @tsv' "$manifest")

if (( failures > 0 )); then
  printf 'Summary: %d failure(s)\n' "$failures"
  exit 1
fi

printf 'PASS  70 work packages and dependency references are structurally valid\n'
