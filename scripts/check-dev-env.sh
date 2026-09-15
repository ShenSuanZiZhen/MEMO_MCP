#!/usr/bin/env bash

set -uo pipefail

failures=0
warnings=0

pass() {
  printf 'PASS  %s\n' "$1"
}

warn() {
  printf 'WARN  %s\n' "$1"
  warnings=$((warnings + 1))
}

fail() {
  printf 'FAIL  %s\n' "$1"
  failures=$((failures + 1))
}

version_ge() {
  local actual="$1"
  local minimum="$2"
  local actual_major actual_minor actual_patch
  local minimum_major minimum_minor minimum_patch

  IFS=. read -r actual_major actual_minor actual_patch <<< "$actual"
  IFS=. read -r minimum_major minimum_minor minimum_patch <<< "$minimum"
  actual_minor="${actual_minor:-0}"
  actual_patch="${actual_patch:-0}"
  minimum_minor="${minimum_minor:-0}"
  minimum_patch="${minimum_patch:-0}"

  if (( 10#$actual_major != 10#$minimum_major )); then
    (( 10#$actual_major > 10#$minimum_major ))
  elif (( 10#$actual_minor != 10#$minimum_minor )); then
    (( 10#$actual_minor > 10#$minimum_minor ))
  else
    (( 10#$actual_patch >= 10#$minimum_patch ))
  fi
}

extract_version() {
  printf '%s' "$1" | sed -E 's/[^0-9]*([0-9]+(\.[0-9]+){0,2}).*/\1/'
}

check_command() {
  local command_name="$1"
  local minimum="$2"
  local version_command="$3"
  local required="${4:-1}"
  local output actual

  if ! command -v "$command_name" >/dev/null 2>&1; then
    if [[ "$required" == "1" ]]; then
      fail "$command_name is not installed (minimum $minimum)"
    else
      warn "$command_name is not installed (optional; minimum $minimum)"
    fi
    return
  fi

  # Use a non-login shell so the caller's PATH is preserved. A login shell can
  # reset PATH and accidentally inspect macOS system tools instead of the
  # Homebrew versions already resolved by command -v above.
  output="$(bash -c "$version_command" 2>/dev/null | head -n 1)"
  actual="$(extract_version "$output")"
  if [[ -z "$actual" ]]; then
    warn "$command_name was found but its version could not be parsed: $output"
  elif version_ge "$actual" "$minimum"; then
    pass "$command_name $actual (minimum $minimum)"
  elif [[ "$required" == "1" ]]; then
    fail "$command_name $actual is below minimum $minimum"
  else
    warn "$command_name $actual is below optional minimum $minimum"
  fi
}

printf 'Modular MCP Studio development environment check\n'
printf 'Host: %s %s\n\n' "$(uname -s)" "$(uname -m)"

check_command git 2.43 'git --version'
check_command node 22.0 'node --version'
check_command pnpm 9.0 'pnpm --version'
check_command corepack 0.25 'corepack --version' 0
check_command docker 27.0 'docker --version'
check_command make 3.81 'make --version'
check_command jq 1.7 'jq --version'
check_command curl 8.0 'curl --version'
check_command openssl 1.1 'openssl version'
check_command python3 3.11 'python3 --version'

if command -v docker >/dev/null 2>&1; then
  if docker info >/dev/null 2>&1; then
    pass 'Docker daemon is reachable'
  else
    fail 'Docker is installed but the daemon is not reachable'
  fi

  if docker compose version >/dev/null 2>&1; then
    compose_output="$(docker compose version 2>/dev/null | head -n 1)"
    compose_version="$(extract_version "$compose_output")"
    if [[ -n "$compose_version" ]] && version_ge "$compose_version" 2.29; then
      pass "Docker Compose $compose_version (minimum 2.29)"
    else
      fail "Docker Compose ${compose_version:-unknown} is below minimum 2.29"
    fi
  else
    fail 'Docker Compose v2 plugin is not available'
  fi
fi

if [[ "${CHECK_OPTIONAL:-0}" == "1" ]]; then
  printf '\nOptional release tooling\n'
  check_command kubectl 1.30 'kubectl version --client=true' 0
  check_command helm 3.15 'helm version --short' 0
  check_command terraform 1.8 'terraform version' 0
  check_command k6 0.51 'k6 version' 0
fi

printf '\nSummary: %d failure(s), %d warning(s)\n' "$failures" "$warnings"

if (( failures > 0 )); then
  exit 1
fi

exit 0
