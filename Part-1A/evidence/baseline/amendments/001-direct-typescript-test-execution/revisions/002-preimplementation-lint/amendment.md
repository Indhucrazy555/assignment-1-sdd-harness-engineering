# Amendment 001, Revision 002: Pre-Implementation Lint

- Date: 2026-11-20
- Approval: Authorized by the user's review request; no reviewer identity is inferred.
- Scope: Correct the lint script for the pre-implementation state and activate new versioned protected-input and harness-control manifests. No application source, acceptance test, specification, dependency, production TypeScript configuration, or build output changed.

## Review findings

The prior active harness-control manifest already included the exact SHA-256 of its active protected-input manifest:

`59765cbf20973c9660fb92b6f86cd107023ba6170278ed4e0edca28c1c6d2250  evidence/baseline/amendments/001-direct-typescript-test-execution/protected-inputs.sha256`

The active policy listed that path under `integrity.protectedInputs.harnessControls`. The integrity checker hashes each listed control and compares it with the active harness-control manifest. The linkage was present and valid; it is retained in this revision with the new active path and hash.

## Lint correction

The previous command, `eslint src tests --max-warnings=0`, passed the absent `src` directory as a literal path. ESLint 10 exits with code 2 when that path has no files. The revised command is:

`eslint "src/**/*.ts" "tests/**/*.ts" --no-error-on-unmatched-pattern --max-warnings=0`

This lints the existing TypeScript tests now, tolerates the absent source glob before implementation, and includes matching TypeScript files under both `src/` and `tests/` as they appear. It does not suppress lint errors or warnings.

## Active manifests

The current active paths, selected by `.harness/policy.json`, are:

- `evidence/baseline/amendments/001-direct-typescript-test-execution/revisions/002-preimplementation-lint/protected-inputs.sha256`
- `evidence/baseline/amendments/001-direct-typescript-test-execution/revisions/002-preimplementation-lint/harness-control.sha256`
- `evidence/baseline/acceptance-test-inventory.json`

The active harness-control manifest contains the active protected-input manifest's SHA-256:

`e680b63082b43aeaa6cd09944abf0f43304ec4e28d6f14a8035d8c609c1a77cc  evidence/baseline/amendments/001-direct-typescript-test-execution/revisions/002-preimplementation-lint/protected-inputs.sha256`

The previous revision's manifests and the original T019 baseline files remain unchanged.

## Old/new SHA-256 values

`package.json#scripts` hashes use the harness's sorted-key canonical JSON representation. Other listed hashes are over exact file bytes.

| Artifact | Revision 001 | Revision 002 | Status |
|---|---|---|---|
| `package.json#scripts` | `59892d4128c8bd0ad964a782ee7b78c98c974a8a9423c7572939d98cb2505eda` | `200847e36c3097e2db9d98cecbf8044bc73e44409ba0c5b2494effba2e6d8877` | Updated |
| `package.json` | `9462bd6523a915e38c2ea521e373b1186291cd2fb63a3ec7c8d0e686aad4c5e1` | `988a67a7397dcde007b0606a9ece4857d7e900b5ff480dc3a127e41e79affe0f` | Updated |
| `.harness/policy.json` | `2d8cc75861e2f2835f4894a23d90226c0ca5575d9e6ce18fe2f2cac326ca9e8d` | `07c00fdcab09cbd63cb8bb27eeca7384ec416b04ce93283a1bd7629c96fb57c4` | Updated |
| `evidence/README.md` | `647890c6e046c37c885cccc3aa40578080b770d085de360291c33c761bba187c` | `26046eea57a84f9caf7d4958150702d89fb4df05a76663b262d649b07709438c` | Updated |
| `.harness/checks/verify-integrity.mjs` | `8c9f91f8ebc54d875a03015aae3858f3eca2e8a1d5691023b1dc59c14f122f28` | `8c9f91f8ebc54d875a03015aae3858f3eca2e8a1d5691023b1dc59c14f122f28` | Unchanged |
| `package-lock.json` | `44e4cf94e138a078fe9794b31983454be133ba79c3dbff0f49316dd81d857617` | `44e4cf94e138a078fe9794b31983454be133ba79c3dbff0f49316dd81d857617` | Unchanged |
| `tsconfig.json` | `11ebf49953aea59c770c255005b177e01f83a9e01a6236d835c1bc652a4d3f01` | `11ebf49953aea59c770c255005b177e01f83a9e01a6236d835c1bc652a4d3f01` | Unchanged |

| Active manifest | Revision 001 SHA-256 | Revision 002 SHA-256 |
|---|---|---|
| Protected inputs | `59765cbf20973c9660fb92b6f86cd107023ba6170278ed4e0edca28c1c6d2250` | `e680b63082b43aeaa6cd09944abf0f43304ec4e28d6f14a8035d8c609c1a77cc` |
| Harness controls | `6db2a6c4962a440e97aa23ebfd0d509c22a35dd8ebeb9919e8af7a6afd211ba9` | `dcb2fc7aa77cbfdccb5ac2b5cb07019e226c55bef1e552b546738b7f145621c4` |
| Supplementary artifacts | `70f46fce4c133e0ede6d99d52856d34c4232310c0d452c3f115bfa1173bf1cc0` | `7c0810b7eecff408b2c8fe26f767506ca93fc965fb0de007566545ce5051c446` |

## Validation

- `npm run lint`: PASS with `src/` absent.
- `npx eslint tests --max-warnings=0`: PASS.
- `node .harness/checks/verify-integrity.mjs`: PASS.
