# Baseline Amendment 001: Direct TypeScript Test Execution

- Date: 2026-11-20
- Approval: The user selected the versioned-active-baseline option in this session. No reviewer identity is inferred.
- Rationale: `tsconfig.json` includes only production files under `src/`, while the npm test scripts attempted to run compiled `dist/tests/` files that the build cannot emit. Run the existing TypeScript tests directly with Node.js 24's `--experimental-strip-types` and built-in test runner.
- Scope: Update the four npm test scripts and select versioned integrity manifests through policy. Keep application code, acceptance tests, specifications, `tsconfig.json`, build output, and dependencies unchanged.

## Current status

The manifests and hashes below record revision 001 and remain unchanged. Revision 002
corrects the pre-implementation lint glob while preserving this baseline; the active manifests
are now under `revisions/002-preimplementation-lint/`. See that revision's `amendment.md` for
the current active paths and updated hashes.

## Test command amendment

| Script | Previous command behavior | Amended command behavior |
|---|---|---|
| `test:unit` | Build, then run `dist/tests/unit` | Run both existing unit `.test.ts` files directly |
| `test:integration` | Build, then run `dist/tests/integration` | Run the existing integration `.test.ts` file directly |
| `test:contract` | Build, then run `dist/tests/contract` | Run the existing contract `.test.ts` file directly |
| `test:coverage` | Build and run `dist/tests` under c8 | Run the four existing `.test.ts` files directly under c8; retain existing thresholds |

Each amended test command uses `node --experimental-strip-types --test`. Test files are specified explicitly because Node's directory-form test invocation did not discover the `.ts` files in this environment.

## Initial active baseline version (revision 001)

The active protected-input and harness-control manifests are:

- `evidence/baseline/amendments/001-direct-typescript-test-execution/protected-inputs.sha256`
- `evidence/baseline/amendments/001-direct-typescript-test-execution/harness-control.sha256`

`.harness/policy.json` selects these paths. The integrity checker now reads all three active baseline paths from policy. The versioned harness-control manifest pins the active protected-input manifest as well as policy and harness controls.

The original T019 baseline files remain at their original paths and are unchanged. The acceptance-test inventory remains active at `evidence/baseline/acceptance-test-inventory.json`. This version's `approved-artifacts.sha256` is supplemental and is not consumed by the integrity checker.

## Changed artifact hashes

Hashes are SHA-256 over exact file bytes, except `package.json#scripts`, which uses the harness's sorted-key canonical JSON representation.

| Artifact | Original hash | Amended hash | Status |
|---|---|---|---|
| `package.json#scripts` | `4154bea295ca7395258ffdb8ed7ce8dd1210d76e90cf54078497594086aa91b2` | `59892d4128c8bd0ad964a782ee7b78c98c974a8a9423c7572939d98cb2505eda` | Updated |
| `package.json` | `663781607f68a2112a623944ec6a082d6e30103ffae6c9a01df714d7274817a0` | `9462bd6523a915e38c2ea521e373b1186291cd2fb63a3ec7c8d0e686aad4c5e1` | Updated |
| `.harness/policy.json` | `72ab6336fe454bf4d74bcc86b8c3d1441503009fc9938a1057145c7a608bda3c` | `2d8cc75861e2f2835f4894a23d90226c0ca5575d9e6ce18fe2f2cac326ca9e8d` | Updated |
| `.harness/checks/verify-integrity.mjs` | `072d3388881ff39d3314c254e25fb18286fa89a3102a7ee50a82359bfabef288` | `8c9f91f8ebc54d875a03015aae3858f3eca2e8a1d5691023b1dc59c14f122f28` | Updated |
| `evidence/README.md` | `f1ee434122e8c5a6d0fd7e12812e6a0d84125e3da4239d4e53b0bcbb5a1b5c86` | `647890c6e046c37c885cccc3aa40578080b770d085de360291c33c761bba187c` | Updated |
| `package-lock.json` | `44e4cf94e138a078fe9794b31983454be133ba79c3dbff0f49316dd81d857617` | `44e4cf94e138a078fe9794b31983454be133ba79c3dbff0f49316dd81d857617` | Unchanged |
| `tsconfig.json` | `11ebf49953aea59c770c255005b177e01f83a9e01a6236d835c1bc652a4d3f01` | `11ebf49953aea59c770c255005b177e01f83a9e01a6236d835c1bc652a4d3f01` | Unchanged |

## Baseline manifest hashes

| Manifest | Original T019 hash | Amended active hash |
|---|---|---|
| Protected inputs | `e1b576a0a2c5e242cc44c0a7c9ee6b08fa115a9b43653a81413229f85f801ae2` | `59765cbf20973c9660fb92b6f86cd107023ba6170278ed4e0edca28c1c6d2250` |
| Harness controls | `2ffe0d151b1e6d25331c5076e251a8a5643ae281f873099ae39695c3dff22ee1` | `6db2a6c4962a440e97aa23ebfd0d509c22a35dd8ebeb9919e8af7a6afd211ba9` |
| Acceptance-test inventory | `4683c0194c41edccd0374d4aa796a5e3b0fdf994a4f67f14745ace47c6c22b9f` | `4683c0194c41edccd0374d4aa796a5e3b0fdf994a4f67f14745ace47c6c22b9f` |
| Supplemental approved artifacts | `816d398608261f0dada6e931f4469653a61191ddebbaa2031d379d21d62fc903` | `70f46fce4c133e0ede6d99d52856d34c4232310c0d452c3f115bfa1173bf1cc0` |

The original T019 files remain unchanged:

| Original file | SHA-256 before | SHA-256 after |
|---|---|---|
| `evidence/baseline/protected-inputs.sha256` | `e1b576a0a2c5e242cc44c0a7c9ee6b08fa115a9b43653a81413229f85f801ae2` | `e1b576a0a2c5e242cc44c0a7c9ee6b08fa115a9b43653a81413229f85f801ae2` |
| `evidence/baseline/harness-control.sha256` | `2ffe0d151b1e6d25331c5076e251a8a5643ae281f873099ae39695c3dff22ee1` | `2ffe0d151b1e6d25331c5076e251a8a5643ae281f873099ae39695c3dff22ee1` |
| `evidence/baseline/acceptance-test-inventory.json` | `4683c0194c41edccd0374d4aa796a5e3b0fdf994a4f67f14745ace47c6c22b9f` | `4683c0194c41edccd0374d4aa796a5e3b0fdf994a4f67f14745ace47c6c22b9f` |
