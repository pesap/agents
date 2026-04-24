import { BLOCKED_COMMAND_PATTERNS, UV_INSTALL_GUIDANCE } from "../lib/constants";

function formatBlockedCommandMessage(headline: string, guidance: string[]): string {
  return [headline, "", ...guidance.map((line) => `  ${line}`), ""].join("\n");
}

export function getBlockedCommandMessage(command: string): string | null {
  if (BLOCKED_COMMAND_PATTERNS.pip.test(command)) {
    return formatBlockedCommandMessage("Error: pip is disabled while khala is active. Use uv instead:", UV_INSTALL_GUIDANCE);
  }

  if (BLOCKED_COMMAND_PATTERNS.pip3.test(command)) {
    return formatBlockedCommandMessage("Error: pip3 is disabled while khala is active. Use uv instead:", UV_INSTALL_GUIDANCE);
  }

  if (BLOCKED_COMMAND_PATTERNS.poetry.test(command)) {
    return formatBlockedCommandMessage("Error: poetry is disabled while khala is active. Use uv instead:", [
      "To initialize a project: uv init",
      "To add a dependency: uv add PACKAGE",
      "To sync dependencies: uv sync",
      "To run commands: uv run COMMAND",
    ]);
  }

  if (BLOCKED_COMMAND_PATTERNS.pythonPip.test(command)) {
    return formatBlockedCommandMessage("Error: 'python -m pip' is disabled while khala is active. Use uv instead:", UV_INSTALL_GUIDANCE);
  }

  if (BLOCKED_COMMAND_PATTERNS.pythonVenv.test(command)) {
    return formatBlockedCommandMessage("Error: 'python -m venv' is disabled while khala is active. Use uv instead:", [
      "To create a virtual environment: uv venv",
    ]);
  }

  if (BLOCKED_COMMAND_PATTERNS.pythonPyCompile.test(command)) {
    return formatBlockedCommandMessage(
      "Error: 'python -m py_compile' is disabled while khala is active because it writes .pyc files to __pycache__.",
      ["To verify syntax without bytecode output: uv run python -m ast path/to/file.py >/dev/null"],
    );
  }

  if (BLOCKED_COMMAND_PATTERNS.pythonExplicitPath.test(command)) {
    return formatBlockedCommandMessage(
      "Error: Direct path-qualified Python executables (for example `/usr/bin/python3`) are disabled while khala is active.",
      [
        "Use `python` or `python3` so khala can route through uv.",
        "For explicit interpreter control, run: uv run python ...",
      ],
    );
  }

  return null;
}
