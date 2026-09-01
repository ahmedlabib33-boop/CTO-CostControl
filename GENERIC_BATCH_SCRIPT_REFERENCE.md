# Generic Batch-Script Reference

## Purpose

This document describes the responsibilities and internal behavior of three operator-controlled scripts:

- `CrUp_JSON.bat`
- `powershell.bat`
- `Clean_Vercel.bat`

It is intentionally generic. All filesystem locations, GitHub settings, branch names, public URLs, and source formats should be configurable.

## Responsibility Boundary

| Script | Primary responsibility | Creates local JSON | Publishes generated output | Removes generated output | Verifies Vercel |
|---|---|---:|---:|---:|---:|
| `CrUp_JSON.bat` | Interactive local create, update, and historical restore | Yes | No | No | No |
| `powershell.bat` | Mirror the local generated tree to GitHub | No | Yes | Mirrors removed remote paths | No |
| `Clean_Vercel.bat` | Interactive cleanup, backup, publication, and live confirmation | Rebuilds indexes | Yes | Yes | Yes |

## Shared Generic Folder Model

```text
<workspace>/
  incoming/
  historical-input/
  generated/
    datasets/
      <dataset-key>/
        history/
          <period>/
            <fingerprint>.json
            latest.json
        latest.json
    datasets.json
    aggregate/latest.json
  runtime/
    scan-state.json
    cleanup-backups/
```

# `CrUp_JSON.bat`

## Purpose

`CrUp_JSON.bat` is an interactive local JSON controller.

It previews every candidate and asks before creating, updating, or restoring JSON. It does not upload to GitHub and does not wait for Vercel.

## Batch Wrapper

The wrapper uses a batch-and-Python polyglot pattern:

1. Disable command echo.
2. Start a local environment scope.
3. Change the working directory to the batch file's directory.
4. Store the absolute batch path and workspace root in environment variables.
5. Start PowerShell with a stop-on-error policy.
6. Read the batch file as text.
7. Find the final Python payload marker.
8. Extract all text after the marker.
9. Create the runtime directory when missing.
10. Write the Python payload to a uniquely named UTF-8 temporary file.
11. Run Python with the temporary file and workspace root.
12. Capture the Python exit code.
13. Delete the temporary helper in a `finally` block.
14. Return the captured result to the batch wrapper.
15. Print a completion message only for exit code zero.
16. Print an error message without assuming success for a nonzero exit code.
17. Pause so the operator can read the result.

The temporary file name should include a random identifier to prevent collisions between simultaneous runs.

## Runtime Dependencies

The embedded Python controller imports reusable modules for:

- Source scanning.
- File-stability checks.
- Source adapters.
- SHA-256 fingerprints.
- Data normalization.
- JSON generation.
- Aggregate regeneration.

The batch file should orchestrate these modules rather than duplicate their parsing logic.

## Candidate Data Structure

The internal candidate record should contain:

- Absolute source path.
- SHA-256 fingerprint.
- Destination dataset key.
- Display label.
- Period key.
- Current processing status.
- Proposed action classification.
- Existing revision path when present.
- Current latest period.
- Inspection findings.
- Resolution outcome.

The structure is built during read-only inspection and is reused for terminal preview and approval.

## Source Collection

The source collector:

1. Creates the current and historical input directories when absent.
2. Recursively scans both roots.
3. Applies the supported-extension allowlist.
4. Ignores temporary files.
5. Resolves every path.
6. Deduplicates resolved paths.
7. Sorts by parent path and file name using case-insensitive ordering.

If no supported files exist, the script exits successfully with a clear `no files found` message and changes no JSON.

## JSON Helper

The JSON reader:

- Opens UTF-8 JSON.
- Returns a supplied default for a missing or unreadable optional file.
- Never treats a malformed required file as verified data.

For stronger implementations, malformed required JSON should stop the candidate rather than silently reset it.

## Revision Lookup

The revision lookup searches generated history for:

```text
*/history/*/<fingerprint>.json
```

If found, the source is classified as unchanged regardless of its file name or folder.

## Current-Latest Lookup

The lookup opens:

```text
generated/datasets/<dataset-key>/latest.json
```

and returns its period value.

If the dataset namespace does not exist, the result is empty.

## Period-Existence Check

The controller checks whether this path exists:

```text
generated/datasets/<dataset-key>/history/<period>/
```

This distinguishes a new revision for an existing period from a completely new period.

## Read-Only Inspection

For each source, the inspector:

1. Opens the source through the shared adapter.
2. Reads its supported sections.
3. Determines the destination dataset and period.
4. Reads the adapter fingerprint.
5. Closes the source in a `finally` block.
6. Finds any existing identical revision.
7. Reads the current latest period.
8. Checks whether the proposed period exists.
9. Creates the candidate classification.

No generated file is changed during this stage.

## Classification Rules

The decision order should be deterministic:

1. Existing fingerprint -> **unchanged**.
2. Unsafe or unresolved destination -> **blocked**.
3. Missing generated namespace -> **create**.
4. Existing period with new fingerprint -> **update period**.
5. Earlier period than current latest -> **restore older period**.
6. Later period than current latest -> **add newer period**.
7. Otherwise -> **add period to existing namespace**.

The order matters. Fingerprint equality must be checked before deciding that a file is an update.

## Destination Preview

For a writable candidate, the terminal displays the future locations of:

- Immutable revision JSON.
- Period-level latest JSON.
- Dataset-level latest JSON.
- Raw source-derived output folder.
- Global dataset index.
- Aggregate latest JSON.
- Generated audit or registry output.

This preview gives the operator a precise scope before approval.

## Candidate Terminal Output

For each candidate, display:

- Candidate number and total count.
- Relative source path.
- Proposed action.
- Destination label and key.
- Period.
- Current latest period.
- SHA-256 fingerprint.
- Existing revision path when present.
- Exact destination paths.
- Warnings and blocking reasons.

## Interactive Choices

### Unchanged candidate

```text
Enter = keep identical JSON unchanged
Q     = stop the run
```

Identical output is not recreated by default.

### Writable candidate

```text
Expected confirmation verb = process the source
N                          = skip the source
Q                          = stop the run
```

The displayed verb can be `CREATE`, `UPDATE`, or `RESTORE` so the operator confirms the exact action.

### Blocked candidate

The normal write choice is unavailable. The source is skipped safely.

## Pre-Write Stability Recheck

After approval and immediately before parsing, the script repeats the stability check.

This closes the gap between preview and write. If the source changed after inspection, the write stops and the source must be inspected again.

## JSON Generation

After approval, the shared parser:

1. Reopens the stable source.
2. Produces the normalized JSON contract.
3. Writes an immutable fingerprint revision.
4. Updates the selected period's latest revision.
5. Updates dataset-level latest only when the period is chronologically newest.
6. Writes raw or enriched supporting output when configured.
7. Returns a generation summary.

If the summary indicates that no safe output was published, the candidate is counted as blocked.

## Aggregate Regeneration

After a successful candidate write, the controller rebuilds:

- Global dataset index.
- Aggregate latest JSON.
- Dataset count.
- Deterministic aggregate fingerprint.

## Post-Write Verification

The controller verifies:

- Immutable revision exists.
- Fingerprint matches the approved source.
- Period matches the approved period.
- Period list is sorted.
- Dataset-level latest points to the maximum chronological period.
- Aggregate regeneration completed.

Only then does it print `confirmed JSON write`.

## Duplicate-in-Run Protection

A set of fingerprints processed during the current run prevents the same content from being processed twice when it appears in both source roots.

The duplicate is counted as unchanged.

## Run Summary

At exit, print separate totals for:

- Created namespaces.
- Updated periods.
- Restored older periods.
- Kept unchanged.
- Skipped by operator.
- Blocked safely.
- Failed.

Return nonzero when unexpected failures occurred. Skipped or safely blocked candidates do not automatically mean the controller itself failed.

## What This Script Must Not Do

- Upload to GitHub.
- Trigger Vercel directly.
- Delete source files.
- Delete generated history.
- Recreate identical revisions by default.
- Move an older period to dataset-level latest.
- Print confirmation before reopening and verifying the output.

# `powershell.bat`

## Purpose

`powershell.bat` mirrors the local generated-output tree to one GitHub branch through the GitHub REST API.

It does not read source files, generate JSON, or verify Vercel.

## Required Configuration

```text
GITHUB_OWNER=<account or organization>
GITHUB_REPO=<target repository>
GITHUB_BRANCH=<target branch>
GITHUB_TOKEN=<fine-grained token from process environment>
UPLOAD_FOLDER=<absolute local generated-output folder>
UPLOAD_PREFIX=<repository-relative generated-output prefix>
```

The token must never be committed or placed in a `NEXT_PUBLIC_` variable.

## Batch Wrapper

The wrapper:

1. Starts a local environment scope.
2. Changes to its own directory.
3. Sets or reads configuration variables.
4. Starts PowerShell without loading a user profile.
5. Uses stop-on-error behavior.
6. Returns a nonzero batch exit code when PowerShell fails.
7. Prints `upload completed` only after branch update success.
8. Pauses so the operator can inspect the output.

## Authentication Validation

The PowerShell payload:

- Reads the token from the environment.
- Rejects an empty token.
- Rejects a known placeholder token.
- Sends the token only in the HTTPS authorization header.
- Does not write the token to disk.
- Does not print the token.

## Local-Folder Validation

Before contacting GitHub, the script confirms:

- Upload folder exists.
- Upload folder is the intended generated root.
- At least one generated file exists, unless an explicit empty-tree publication mode is supported.

## Read Current Remote State

The publisher calls the GitHub API to obtain:

1. Target branch reference.
2. Current branch-head commit.
3. Base tree SHA.
4. Recursive remote tree.

If GitHub reports that the recursive tree is truncated, the script stops. Continuing could miss remote paths and produce an incomplete mirror.

## Enumerate Local Generated Files

The script recursively lists all local generated files.

For each file:

1. Remove the absolute local-folder prefix.
2. Normalize separators to `/`.
3. Prepend the configured remote upload prefix.
4. Add the normalized path to a case-insensitive local-path set.
5. Read raw bytes.
6. Convert bytes to Base64.
7. Create a Git blob through the API.
8. Store the returned blob SHA in a tree entry.

## Remote Deletion Mirroring

The publisher compares the remote tree with the local-path set.

For every remote blob under the generated prefix that has no local equivalent, it adds a tree entry with:

```text
sha = null
```

This removes stale generated files from the new remote tree.

Files outside the generated prefix are never included in deletion logic.

## Create New Tree

The publisher submits:

- Existing base tree SHA.
- Blob entries for every local generated file.
- Null-SHA deletion entries for stale remote generated files.

GitHub returns a new tree SHA.

If the new tree SHA equals the base tree SHA, the script prints `no generated-data changes` and exits successfully without creating a commit.

## Create Commit

When the tree changed, the script creates a commit containing:

- Fixed or configurable data-publication message.
- New tree SHA.
- Current branch-head commit as its only parent.

The returned commit SHA is not yet proof that the branch changed.

## Advance Branch

The script patches the branch reference to the new commit with force disabled.

If another writer advanced the branch first, the update should fail rather than overwrite the newer branch state. A robust implementation then reloads the new branch head, rebuilds the tree, and asks the operator to retry.

## Completion Output

Success output includes:

- Each uploaded generated path.
- Each stale remote generated path removed.
- New commit SHA.
- Notice that the hosting deployment should start automatically.

This script does not prove that Vercel completed successfully.

## Mirror Semantics

```text
Local generated file present
  -> create or update the same remote generated path

Local generated file absent and remote generated file present
  -> delete the remote generated path

Remote file outside generated prefix
  -> leave unchanged
```

## What This Script Must Not Do

- Process source files.
- Invent or repair generated JSON.
- Upload the input queue.
- Upload runtime state or backups.
- Modify paths outside the generated prefix.
- Force-update the branch.
- Claim Vercel success.

# `Clean_Vercel.bat`

## Purpose

`Clean_Vercel.bat` is an interactive controller for safely removing generated data, backing up matching active sources, clearing matching scan-state memory, publishing the generated-tree changes, and verifying the public result.

## Batch Wrapper

The wrapper uses a batch-and-PowerShell polyglot pattern:

1. Start a local environment scope.
2. Change to the batch file's directory.
3. Store the absolute batch path.
4. Start PowerShell with stop-on-error behavior.
5. Read the batch file as text.
6. Find the final PowerShell payload marker.
7. Execute the payload as a script block.
8. Capture the PowerShell exit code.
9. Pause when the operation ends with an error.

## Configured Paths and Values

The PowerShell payload receives or defines:

- Workspace root.
- Generated root.
- Generated dataset root.
- Global index paths.
- Aggregate latest path.
- Active input root.
- Local scan-state path.
- Timestamped backup root.
- GitHub account, repository, branch, and token source.
- Public Vercel URL.

All resolved destructive paths must remain under the configured allowed roots.

## JSON Reader

The JSON reader:

- Returns a supplied default when an optional file does not exist.
- Reads UTF-8 text.
- Converts JSON into objects.
- Throws a clear error for malformed existing JSON.

Cleanup must not treat malformed control JSON as a valid empty state.

## JSON Writer

The JSON writer:

- Creates the parent directory when missing.
- Serializes deeply nested objects.
- Writes UTF-8 without a byte-order mark.
- Ends the file with a newline.

For stronger crash safety, implementations should write to a temporary file and atomically replace the destination.

## Aggregate Fingerprint Helper

The helper serializes the current ordered aggregate list and calculates SHA-256.

For an empty list, it calculates the fingerprint of the canonical empty representation. This provides a reproducible value for live zero-state verification.

## Token Handling

The cleaner:

1. Uses an existing environment token when available.
2. Otherwise displays a hidden secure prompt only when publication becomes necessary.
3. Converts the secure value in memory.
4. Clears unmanaged secure-memory buffers after conversion.
5. Refuses to publish when no token was supplied.

The token is never saved to generated JSON or printed.

## Generated-Dataset Enumeration

The cleaner rebuilds its interactive list at runtime from:

- Global dataset index.
- Generated dataset directories.
- Dataset-level latest JSON.

It merges and sorts those sources. No dataset names are hardcoded in the menu.

## Active-Source Enumeration

The input scanner:

- Recursively enumerates the active input root.
- Applies a configurable extension allowlist.
- Ignores temporary files.
- Returns file objects for later backup matching.

## Scan-State Matching

The local state cache is searched for entries associated with:

- One selected dataset.
- One selected dataset and period.
- Every dataset.

Matching entries are removed when their generated output is removed. Otherwise the watcher could treat a reintroduced source as already processed.

## Safe Backup Move

Before moving a source file:

1. Resolve its absolute path.
2. Build the allowed input-root prefix.
3. Reject the operation if the resolved path falls outside that prefix.
4. Build a timestamped backup destination.
5. Preserve the source's relative subfolder path.
6. Create destination directories.
7. Move the source into backup.
8. Return the new backup paths for confirmation.

The active source is moved, not permanently destroyed.

## Clear Matching Scan State

The state-cleaning routine:

- Opens the local state file.
- Iterates its file-entry properties.
- Removes entries matching the requested dataset or period.
- Supports an all-entries switch.
- Rewrites the updated state.
- Returns the number of removed entries.

## Create Valid Empty Indexes

The zero-state routine:

1. Writes the global dataset index as an empty array.
2. Preserves the aggregate object's schema where possible.
3. Replaces its dataset list with an empty array.
4. Sets its count to zero.
5. Updates its generation timestamp.
6. Calculates the canonical empty fingerprint.
7. Rewrites generated registries as valid empty structures.

Empty state uses valid JSON files rather than deleting every index required by the browser consumer.

## Remove One Dataset

The removal routine:

1. Resolves the selected generated namespace path.
2. Verifies it is a child of the generated dataset root.
3. Recursively removes only that namespace.
4. Removes the dataset from the global index.
5. Removes it from the aggregate list.
6. Recalculates aggregate count.
7. Recalculates aggregate fingerprint.
8. Updates generated timestamps.
9. Rewrites the indexes.

## Enumerate Periods

The period lister reads subdirectories under:

```text
generated/datasets/<dataset-key>/history/
```

It includes only period directories containing a valid period-level latest file and sorts them chronologically.

## Remove One Period

The period-removal routine:

1. Resolves the dataset root and verifies its allowed prefix.
2. Resolves the period path and verifies it is under the history root.
3. Refuses to continue if the period does not exist.
4. Deletes the selected period history directory.
5. Deletes matching raw and enriched period directories.
6. Re-enumerates remaining periods.
7. Removes the complete dataset when no periods remain.
8. Otherwise copies the newest remaining period-level latest file to dataset-level latest.
9. Updates generated audit values to reference the new latest period.
10. Rebuilds the aggregate output.

## GitHub Publication

The cleaner contains its own generated-prefix GitHub API mirror.

It:

1. Reads the current branch reference, commit, and tree.
2. Enumerates every local generated file.
3. Creates blobs.
4. Creates tree entries.
5. Adds null-SHA deletions for stale remote generated paths.
6. Creates a new tree.
7. Skips commit creation when the tree is unchanged.
8. Creates a cleanup commit when changed.
9. Advances the branch without force.
10. Returns the commit SHA.

## Live HTTP Helper

The helper requests a URL with a bounded timeout and returns:

- Numeric HTTP status on response.
- Zero when no HTTP status can be obtained.

It is used to verify that removed generated paths return 404.

## Vercel Verification

After publication, the cleaner polls the public origin.

Each attempt:

1. Creates a timestamp nonce.
2. Requests the health endpoint without cache.
3. Requests the live global dataset index without cache.
4. Compares live count with expected count.
5. Compares live aggregate fingerprint with expected fingerprint.
6. When removing one dataset, confirms it is absent from the live index.
7. Confirms the removed latest path returns 404.

Verification returns success only when every applicable condition is true during the bounded retry window.

## Interactive Removal of One Dataset

The interactive handler:

1. Finds scan-state paths and active source files associated with the selected dataset.
2. Displays the dataset, generated deletion scope, scan-state scope, and backup-file count.
3. Lists every matching active source path.
4. Requires an exact confirmation phrase.
5. Creates a timestamped backup root.
6. Moves matching active sources to backup.
7. Clears matching scan-state entries.
8. Removes the generated dataset.
9. Publishes the generated-tree mirror.
10. Prints local deletion, backup, removed-state count, and commit SHA separately.
11. Waits for live verification.
12. Prints confirmed absence only after verification succeeds.

## Interactive Removal of One Period

The interactive handler:

1. Lists available periods with numbers.
2. Accepts a number or back command.
3. Validates the choice range.
4. Reads the selected period's source reference.
5. Finds associated scan-state entries and active sources.
6. Displays the precise history, raw, enriched, state, and backup scope.
7. Requires a stronger exact period-removal phrase.
8. Backs up matching active sources.
9. Clears period-specific scan state.
10. Removes the period and rebuilds latest output.
11. Publishes the generated tree.
12. Verifies the expected live aggregate fingerprint.

## Dataset Submenu

```text
1 = clean the complete generated dataset
2 = remove one reporting period
B = return to the generated-data list
```

Invalid choices change nothing.

## Interactive Clean-All

The all-data handler:

1. Enumerates every active source.
2. Displays the complete scope in a high-visibility warning.
3. Requires an exact multi-word confirmation phrase.
4. Creates a timestamped backup.
5. Moves every active source to backup.
6. Clears all scan-state entries.
7. Removes every generated dataset directory after path validation.
8. Writes valid empty global indexes.
9. Publishes generated deletions and empty indexes.
10. Prints backup location and commit SHA.
11. Polls Vercel.
12. Confirms only when the live count is zero and the empty fingerprint matches.

## Interactive Move-Only Action

The move-only handler:

1. Lists supported files currently in the active input queue.
2. Accepts one number, all, or back.
3. Displays the selected source paths.
4. Requires an exact move confirmation phrase.
5. Moves the selected files to timestamped backup.
6. Prints the backup destination.

It does not change generated JSON, GitHub, or Vercel.

## Main Menu Loop

The menu remains open after each operation.

```text
NUMBER = open one dataset's cleanup submenu
M      = move active sources to backup only
A      = remove all generated data
R      = rebuild and display the current list
EXIT   = close
```

The numbered list is regenerated on every loop so earlier operations are immediately reflected.

## Confirmation Model

Destructive actions require exact phrases, not single-key confirmation.

The confirmation should include the action scope:

- One complete dataset.
- One period.
- All generated data.
- Move-only source backup.

Any other input cancels the action without changing data.

## What This Script Must Not Do

- Permanently erase active sources without backup.
- Delete paths outside configured generated roots.
- Leave scan-state entries that would incorrectly suppress reprocessing.
- Remove every global index needed for a valid empty state.
- Force-update the GitHub branch.
- Claim live success when only the local deletion succeeded.
- Claim live success when only the GitHub commit succeeded.
- Convert a timeout into confirmation.

# Recommended Manual Sequences

## Create, Update, or Restore

```text
1. Place source files in the current or historical source folder.
2. Run CrUp_JSON.bat.
3. Review every fingerprint, action, period, and destination.
4. Approve only correct local writes.
5. Confirm the local run summary.
6. Run powershell.bat.
7. Confirm the returned GitHub commit SHA.
8. Independently confirm Vercel deployment and live JSON.
```

## Remove Generated Data

```text
1. Run Clean_Vercel.bat.
2. Choose one dataset, one period, or all.
3. Review deletion, state, and backup scope.
4. Enter the exact confirmation phrase.
5. Wait for local cleanup.
6. Wait for GitHub publication.
7. Wait for the script's confirmed live result.
```

`Clean_Vercel.bat` publishes its cleanup itself. Running `powershell.bat` immediately afterward is normally unnecessary.

## Pause Processing Without Changing Published Output

```text
1. Run Clean_Vercel.bat.
2. Choose the move-only action.
3. Select one source or all sources.
4. Confirm the move.
5. Record the timestamped backup location.
```

# Generic Safety Invariants

1. Preview before local JSON writes.
2. Recheck file stability after approval.
3. Use SHA-256 for revision equality.
4. Keep immutable revisions.
5. Insert older periods chronologically.
6. Restrict publication to the generated prefix.
7. Mirror remote deletions only inside that prefix.
8. Resolve and validate every destructive path.
9. Back up active sources before moving them out of the input queue.
10. Clear matching scan-state when generated output is removed.
11. Use environment-only secrets.
12. Use non-force branch updates.
13. Distinguish local success, GitHub success, deployment success, and live verification.
14. Never issue confirmation for an unverified stage.

# Minimal Generic Configuration

```text
WORKSPACE_ROOT=<absolute local root>
CURRENT_INPUT_DIR=<active source folder>
HISTORICAL_INPUT_DIR=<historical source folder>
GENERATED_DIR=<public generated root>
STATE_FILE=<local scan-state path>
BACKUP_DIR=<timestamped backup root>
SUPPORTED_EXTENSIONS=<allowlist>

GITHUB_OWNER=<account or organization>
GITHUB_REPO=<repository name>
GITHUB_BRANCH=<target branch>
GITHUB_TOKEN=<environment-only secret>
UPLOAD_PREFIX=<strict remote generated prefix>

VERCEL_PUBLIC_URL=<public origin>
VERCEL_HEALTH_PATH=<non-cached health endpoint>
VERIFICATION_ATTEMPTS=<bounded integer>
VERIFICATION_DELAY_SECONDS=<positive number>
```

An AI agent adapting these scripts should move reusable logic into testable Python or PowerShell modules and keep the batch files as thin operator entry points.
