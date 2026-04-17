#!/bin/bash
# Measure harness compliance from agent output log
# Usage: ./measure-compliance.sh <agent-output-file>

set -euo pipefail

OUTPUT_FILE="${1:-/dev/stdin}"
CONTENT=$(cat "$OUTPUT_FILE")

TOTAL_CHECKS=8
SCORE=0

# Check 1: Result line present
if echo "$CONTENT" | grep -qE 'Result:\s*(success|partial|failed)'; then
  echo "✓ Result line present"
  SCORE=$((SCORE + 1))
else
  echo "✗ Missing Result line"
fi

# Check 2: Confidence line present  
if echo "$CONTENT" | grep -qE 'Confidence:\s*(0\.[0-9]+|[01])'; then
  echo "✓ Confidence line present"
  SCORE=$((SCORE + 1))
else
  echo "✗ Missing Confidence line"
fi

# Check 3: Preflight line before mutations (if mutations occurred)
if echo "$CONTENT" | grep -qE '(edit|write|bash.*rm|git.*commit)'; then
  if echo "$CONTENT" | grep -qE 'Preflight:\s*skill='; then
    echo "✓ Preflight present for mutations"
    SCORE=$((SCORE + 1))
  else
    echo "✗ Missing Preflight for mutations"
  fi
else
  echo "⊘ No mutations (Preflight not required)"
  SCORE=$((SCORE + 1))
fi

# Check 4: Postflight line after mutations (if mutations occurred)
if echo "$CONTENT" | grep -qE '(edit|write|bash.*rm|git.*commit)'; then
  if echo "$CONTENT" | grep -qE 'Postflight:\s*verify='; then
    echo "✓ Postflight present for mutations"
    SCORE=$((SCORE + 1))
  else
    echo "✗ Missing Postflight for mutations"
  fi
else
  echo "⊘ No mutations (Postflight not required)"
  SCORE=$((SCORE + 1))
fi

# Check 5: Tool call descriptions (look for sentences before tool calls)
TOOL_CALLS=$(echo "$CONTENT" | grep -cE '^(read|edit|write|grep|bash|subagent)' || true)
DESCRIPTIONS=$(echo "$CONTENT" | grep -cE '^[A-Z][a-z]+.*\.(read|edit|write|grep|bash|subagent)' || true)
if [[ "$TOOL_CALLS" -eq 0 ]] || [[ "$DESCRIPTIONS" -ge 1 ]]; then
  echo "✓ Tool call descriptions present"
  SCORE=$((SCORE + 1))
else
  echo "✗ Missing tool call descriptions ($DESCRIPTIONS/$TOOL_CALLS)"
fi

# Check 6: Appropriate skill usage mentioned
if echo "$CONTENT" | grep -iqE 'using skill|loading skill|skill:|surgical-dev|nasa-guidelines'; then
  echo "✓ Skill usage indicated"
  SCORE=$((SCORE + 1))
else
  echo "✗ No skill usage indicated"
fi

# Check 7: Validation/checks mentioned
if echo "$CONTENT" | grep -iqE 'validation|checking|verified|checks?|test|pass|fail'; then
  echo "✓ Validation mentioned"
  SCORE=$((SCORE + 1))
else
  echo "✗ No validation mentioned"
fi

# Check 8: Hook/session awareness
if echo "$CONTENT" | grep -iqE 'hook|session|teardown|compliance|approval'; then
  echo "✓ Session/hook awareness"
  SCORE=$((SCORE + 1))
else
  echo "✗ No session/hook awareness"
fi

# Calculate percentage
COMPLIANCE=$((SCORE * 100 / TOTAL_CHECKS))

METRIC compliance_score=$COMPLIANCE
METRIC checks_passed=$SCORE
METRIC total_checks=$TOTAL_CHECKS

echo ""
echo "Compliance: $COMPLIANCE% ($SCORE/$TOTAL_CHECKS)"
