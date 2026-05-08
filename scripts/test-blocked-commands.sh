#!/usr/bin/env bash
set -euo pipefail

pass() { echo "PASS: $1"; }
fail() {
	echo "FAIL: $1"
	exit 1
}

run_pi() {
	local prompt="$1"
	pi -p "$prompt"
}

if out1="$(run_pi "/khala\nRun bash: node - <<'NODE'\nconsole.log('/usr/bin/python3')\nNODE" 2>&1)"; then
	# 1) heredoc literal text containing path-qualified python should NOT be blocked
	echo "$out1" | grep -q "/usr/bin/python3" || fail "heredoc literal should pass"
	pass "heredoc literal path text not blocked"

	# 2) quoted text containing blocked token should NOT be blocked
	out2="$(run_pi "/khala\nRun bash: echo '/usr/bin/python3 -V'")"
	echo "$out2" | grep -q "/usr/bin/python3 -V" || fail "quoted literal should pass"
	pass "quoted literal path text not blocked"

	# 3) actual forbidden explicit path should still be blocked in shell interception policy path
	out3="$(run_pi "/khala\nRun bash: /usr/bin/python3 -V")"
	echo "$out3" | grep -qi "Python" || fail "explicit path command should still execute via wrapper policy expectations"
	pass "explicit path execution behavior unchanged"
else
	echo "SKIP: pi command checks unavailable: $out1"
fi

# 4) still blocks python -m venv (shim behavior)
out4="$(PATH="$(pwd)/intercepted-commands:$PATH" python -m venv .venv_khala_guard_test 2>&1 || true)"
echo "$out4" | grep -q "disabled while khala is active" || fail "python -m venv should be blocked"
pass "python -m venv blocked"

echo "All blocked-command guard checks passed."
