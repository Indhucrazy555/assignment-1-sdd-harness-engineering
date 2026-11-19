# Amendment 001, Revision 004: Integration Fixture and Coverage Scope

- Date: 2026-11-20
- Approval: Authorized by the user's request; no reviewer identity is inferred.
- Scope: Create the integration fixture's missing parent directory before writing its blocker
  file, constrain c8 collection to application TypeScript sources, and preserve the existing
  final snapshot by capturing later final snapshots under numbered revisions.
- Requirements retained: All test cases and assertions remain; coverage thresholds remain
  80% statements and 80% branches; no application behavior, dependencies, specifications,
  or prior evidence were changed.

## Changes and rationale

1. `tests/integration/json-task-store.test.ts` now creates the parent directory for the
   fixture blocker before writing it. This fixes the setup-time `ENOENT`; the storage failure
   assertions and scenario are unchanged.
2. The `test:coverage` script keeps `--all`, `--check-coverage`, `--statements 80`, and
   `--branches 80`, and adds `--include "src/**/*.ts"`. This limits the coverage denominator
   to application source while excluding harness code, evidence snapshots, tests, and other
   unrelated files.
3. The harness supports `--phase final --revision NNN`. The run remains under
   `evidence/final/runs/`, while its write-once implementation snapshot is stored beneath
   `evidence/final/revisions/NNN/`. The run log records the selected snapshot manifest.
   This preserves the pre-existing final snapshot and all of its evidence.

## Old and new hashes

All file hashes are SHA-256 over exact bytes, except `package.json#scripts`, which uses the
harness's canonical sorted-key JSON representation.

| Artifact | Previous active value | Revision 004 value |
|---|---|---|
| `package.json` | `988a67a7397dcde007b0606a9ece4857d7e900b5ff480dc3a127e41e79affe0f` | `ad95bc10ddfe9a4cae5c9d97090eafafb14977730024dbe116fa11548a906591` |
| `package.json#scripts` | `200847e36c3097e2db9d98cecbf8044bc73e44409ba0c5b2494effba2e6d8877` | `88a7f37475af143daecf20a048e4a8a7b0936f8a73ddb4b925d12de9f33a606c` |
| `tests/integration/json-task-store.test.ts` | `7ac0f3c3153a26967f3f482a439c338d21fba39a144d853410b734c8b3d3c66e` | `b9c13def2724079cc7764578ca8c46e792f03b6cdeae6cd3ee44daa1f3b61c1f` |
| Active acceptance-test inventory | `4683c0194c41edccd0374d4aa796a5e3b0fdf994a4f67f14745ace47c6c22b9f` | `3e30f52c99dcefd2a274c2660fb477382a37985dcce418de3164cc114807bd63` |
| `.harness/policy.json` | `07c00fdcab09cbd63cb8bb27eeca7384ec416b04ce93283a1bd7629c96fb57c4` | `4062a9304be83aa73454d9c48abab54767422c16da33c5c034a35d69add9f678` |
| `.harness/run.mjs` | `cd23871834ae5086712936724365bc44438c81fd0c9906e29f13e34385913959` | `0c523f7db837bed17bdb5f4d8babbb2bf2a698128274b48e5271f2e1cb9fe2e5` |
| `package-lock.json` | `44e4cf94e138a078fe9794b31983454be133ba79c3dbff0f49316dd81d857617` | Unchanged |

The versioned acceptance-test inventory is stored at
`evidence/baseline/amendments/001-direct-typescript-test-execution/revisions/004-integration-coverage-validation/acceptance-test-inventory.json`.
It keeps `testCount: 34`; only the integration test file hash changes.

The active baseline manifests are now:

- Protected inputs:
  `c58629417fefa1727b999c755f4442828e974eb698ce5a2cfb33676227c0df45`
- Harness controls:
  `d7458536fd8fef2adff97824313bbeba19ff91c2a5b25f14a43c300c64d0c2d1`

`.harness/policy.json` selects these manifests and the versioned acceptance-test inventory.
The original T019 files, amendment revisions 001–003, and all prior run evidence remain
unchanged.

## Focused validation

- `npm.cmd run test:integration`: PASS, 8/8 tests; zero skipped or todo.
- `npm.cmd run test:coverage`: PASS, 34/34 tests; 91.03% statements, 90.54% branches,
  95.77% functions, and 91.03% lines. Statement and branch thresholds remain 80%.
- `node .harness/checks/verify-integrity.mjs`: PASS.
- `node .harness/run.mjs --phase final --revision 002`: PASS, all 9 checks; unit 16/16,
  integration 8/8, contract 10/10, and coverage 34/34, with zero skipped or todo.

The complete final run is
`evidence/final/runs/run-20261119T194253475Z-ec4e53a0-8edd-4264-9877-ee72f1b4dcd4/`.
Its snapshot is under `evidence/final/revisions/002/`, and its run log links to that snapshot
manifest. The earlier final snapshot and all earlier run evidence remain preserved. No human
decision file was created.
