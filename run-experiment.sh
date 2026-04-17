#!/bin/bash
# Run harness compliance experiment
set -euo pipefail

cd "$(dirname "$0")"

echo "Starting harness compliance experiment..."

# Initialize experiment
pi --mode rpc '/skill:autoresearch-create' || true

# Create experiment session
cat > /tmp/experiment-input.txt << 'EOF'
Goal: Test which intervention maximizes harness compliance
Command: ./autoresearch.sh
Primary metric: compliance_score percent higher
Files in scope: agent/AGENTS.md, experiments/, commands/
Constraints: Test 3 variants - baseline, enhanced-agents, harness-gate
EOF

echo "Experiment files ready. To run manually:"
echo "1. cd ~/dev/agents"
echo "2. pi"
echo "3. /skill:autoresearch-create"
echo "4. Paste the goal from EXPERIMENT.md"
echo ""
echo "Or run this script in a terminal with pi active."
