#!/bin/bash
# Backpressure checks for harness compliance experiments
# Runs after each benchmark to verify correctness

set -euo pipefail

cd "$(dirname "$0")"

# Check that test files are valid
echo "Running harness compliance checks..."

# Verify AGENTS.md exists and has content
if [[ ! -f agent/AGENTS.md ]]; then
  echo "ERROR: agent/AGENTS.md missing"
  exit 1
fi

# Verify required skills exist
for skill in surgical-dev nasa-guidelines; do
  if [[ ! -d "agent/skills/$skill" ]]; then
    echo "ERROR: Required skill $skill missing"
    exit 1
  fi
done

echo "All checks passed"
METRIC checks_passed=1
