#!/bin/bash
# Harness compliance benchmark runner
# Usage: ./autoresearch.sh <variant> <scenario>

set -euo pipefail

VARIANT="${1:-baseline}"
SCENARIO="${2:-simple_edit}"
TIMESTAMP=$(date +%s)
RUN_ID="${VARIANT}-${SCENARIO}-${TIMESTAMP}"

# Ensure pi is running and we can trigger a test
# This script coordinates with the autoresearch extension

# Setup test environment  
TEST_DIR=".autoresearch-test/${RUN_ID}"
mkdir -p "$TEST_DIR"

# The actual test is run via pi agent - this just sets up the fixture
case "$SCENARIO" in
  simple_edit)
    echo "// Test file for $VARIANT $SCENARIO" > "$TEST_DIR/test.ts"
    ;;
  debug_style)
    echo "const x = 1; // bug: should be 2" > "$TEST_DIR/bug.ts"
    ;;
  feature_request)
    touch "$TEST_DIR/feature.ts"
    ;;
esac

METRIC setup_time=1
METRIC files_created=1
METRIC variant="$VARIANT"
METRIC scenario="$SCENARIO"
