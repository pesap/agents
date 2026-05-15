# Torc HPC runbook

## Goal
Use the documented Torc flow for the chosen mode. Prefer Torc-native commands first, then fall back to helper scripts only when the docs-supported path is not enough.

## 1. Local smoke test
Use this first for syntax, wrapper, and dependency sanity checks.

### Fastest path
```bash
torc -s --in-memory run workflow.yaml
```

### When to use a persistent local server
Use a server/client split only when you need repeated inspection, TUI usage, or multi-step interaction:
```bash
torc-server run --database torc.db --host localhost --completion-check-interval-secs 5
TORC_API_URL=http://localhost:8080/torc-service/v1 torc workflows list
```

Notes:
- Distinguish **standalone/server lifecycle** from **execution mode** (`local`, `remote workers`, `slurm`).
- Use `invocation_script` when environment setup should be outside the job command itself.

## 2. Invocation script workflow
Use this when jobs require modules, conda, env vars, or other site setup.

Pattern:
```bash
#!/usr/bin/env bash
set -euo pipefail
module purge
module load <site-modules>
source <conda-hook-if-needed>
conda activate <env>
exec "$@"
```

Then in the workflow:
```yaml
jobs:
  - name: job1
    command: python run.py
    invocation_script: bash setup.sh
```

Rules:
- keep environment setup in the wrapper, not repeated in job commands
- test the wrapper directly before blaming Torc
- use absolute paths when portability across nodes matters

## 3. Remote workers over SSH
Use this when jobs should run on SSH-accessible machines without Slurm.

### Preconditions
- Torc installed on all machines with matching versions
- SSH key auth works without prompts
- server reachable from all workers

### Typical flow
```bash
torc create workflow.yaml
torc remote add-workers <workflow-id> user@host1 user@host2
torc remote run <workflow-id>
torc remote status <workflow-id>
torc remote collect-logs <workflow-id> --local-output-dir ./logs
```

Key rules:
- use `torc remote ...` for worker lifecycle, not custom ssh loops
- verify `TORC_API_URL` uses the full API base URL when needed
- use `--skip-version-check` only as a temporary debugging escape hatch
- `collect-logs --delete` deletes remote logs/output after collection; it does not manage worker binaries or repo state

## 4. Slurm/HPC submission
Use this for scheduler-backed cluster workflows.

### Canonical flow
```bash
torc hpc detect
torc hpc partitions <profile-name>
torc slurm generate --account <acct> workflow.yaml -o workflow_slurm.yaml
torc submit workflow_slurm.yaml
```

### Remote/tunneled server flow
If the server runs on the cluster or behind a tunnel:
```bash
export TORC_API_URL=http://<host>:<port>/torc-service/v1
torc slurm generate --account <acct> workflow.yaml -o workflow_slurm.yaml
torc submit workflow_slurm.yaml
```

Rules:
- submit the **generated** spec, not the source spec
- prefer `torc submit` as the normal submission path
- do not add an outer shell orchestration layer around normal submit flows
- if using a documented self-contained Slurm job pattern, follow that specific doc rather than general submit guidance

## 5. Git-backed remote code execution
Use this when the user wants to run a specific branch, tag, or commit remotely.

Core rule: **code travels by Git; data stays remote**. Jobs must reference data that already exists on the HPC filesystem, for example `/scratch/$USER/data/...` or `/projects/team/datasets/...`.

### Configure `git push hpc`
Create or reuse a bare Git repository on the cluster and add it as a local remote:

```bash
skills/torc-hpc/scripts/setup-hpc-git-remote.sh \
  --host user@login.cluster \
  --remote-git-dir /scratch/$USER/git/myrepo.git \
  --remote-name hpc
```

Then publish code for a run:

```bash
git push hpc HEAD:refs/heads/my-run
SHA=$(git rev-parse HEAD)
```

### Prepare an exact-SHA run worktree
Materialize the pushed commit into an isolated run directory:

```bash
skills/torc-hpc/scripts/prepare-git-run.sh \
  --host user@login.cluster \
  --remote-git-dir /scratch/$USER/git/myrepo.git \
  --sha "$SHA" \
  --run-root /scratch/$USER/torc-runs/my-run
```

This creates:

```text
/scratch/$USER/torc-runs/my-run/src   # exact SHA worktree
/scratch/$USER/torc-runs/my-run/out   # intended outputs
/scratch/$USER/torc-runs/my-run/logs  # intended logs
/scratch/$USER/torc-runs/my-run/metadata.env
```

Run Torc/Slurm from `src` and point jobs at remote data paths:

```bash
cd /scratch/$USER/torc-runs/my-run/src
torc slurm generate --account <acct> workflow.yaml -o ../workflow_slurm.yaml
torc submit ../workflow_slurm.yaml
```

Rules:
- use a bare Git repo as the receiving `hpc` remote; do not push into a mutable checkout used by jobs
- run jobs from an exact-SHA worktree under a run directory, not from the bare repo or shared checkout
- prefer exact SHA for big dataset runs; branch names are okay only as inputs to locate the SHA
- keep remote data paths explicit; this workflow does not move datasets
- fetch only logs, summaries, and selected artifacts by default; large outputs stay remote unless explicitly requested
- remove temporary worktrees after results are safe

## 6. Manual remote command fallback
Use `scripts/run-remote.sh` only when you truly need to launch a non-Torc remote command manually.

Example:
```bash
skills/torc-hpc/scripts/run-remote.sh \
  --host user@cluster \
  --remote-root /scratch/$USER/khala-runs \
  --workdir /projects/repo/worktree-or-checkout \
  --command 'bash invocation_script.sh some-command ...' \
  --fetch output_dir \
  --out-dir ./artifacts
```

Rules:
- `run-remote.sh` is a remote command runner for an existing remote workdir
- it does **not** materialize the repo remotely
- prepare the code remotely first, then run the command there

## 7. Cleanup for versioned remote runs
Use cleanup helpers only when temporary remote worktrees/refs were created for a versioned run.

Preferred cleanup contract:
1. remove the temporary worktree
2. prune stale worktree metadata
3. delete temporary refs if used
4. keep logs and output artifacts

Typical pattern:
```bash
cleanup() {
  git -C /path/to/repo worktree remove --force "$RUN_DIR/src" 2>/dev/null || true
  git -C /path/to/repo worktree prune
  git push <remote> :refs/heads/runs/$RUN_ID 2>/dev/null || true
}
trap cleanup EXIT
```

## Debug order
1. `command -v torc`
2. `torc --version`
3. `printf '%s\n' "$TORC_API_URL"`
4. `module list` if modules are involved
5. run one small job
6. inspect Torc workflow/job status
7. inspect Torc logs/results/resource data
8. if using remote workers, inspect `torc remote status` and collected logs
9. if using versioned remote runs, verify the fetched commit/branch in the remote checkout/worktree before debugging the job itself
10. if using manual remote fallback, inspect pulled `remote-run-state/` logs

## Rules learned from review
- Prefer `torc -s --in-memory run ...` for the first local smoke test.
- Prefer `torc remote ...` for SSH worker workflows.
- Prefer `torc slurm generate ... -o <generated>.yaml` then `torc submit <generated>.yaml` for Slurm.
- For versioned remote runs, prefer remote fetch/worktree preparation over rsyncing the repo.
