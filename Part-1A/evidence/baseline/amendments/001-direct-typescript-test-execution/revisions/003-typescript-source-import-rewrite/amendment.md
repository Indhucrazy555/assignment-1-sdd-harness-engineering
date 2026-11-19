# Amendment 001, Revision 003: TypeScript Source Import Rewriting

- Date: 2026-11-20
- Approval: Authorized by the user's response to the implementation-scope clarification.
- Scope: Add `rewriteRelativeImportExtensions: true` to `tsconfig.json`. This preserves the
  existing `src/` root, `dist/` output, module target, and build command while rewriting source
  `.ts` relative imports to `.js` in emitted production files.

The acceptance tests execute TypeScript sources directly with Node's strip-only support, so
application modules use `.ts` relative specifiers. Without this compiler option, emitted
`dist/*.js` files would retain `.ts` specifiers and fail when started with the existing
`node dist/server.js` command.

## Hash amendment

| Artifact | Previous SHA-256 | New SHA-256 |
|---|---|---|
| `tsconfig.json` | `11ebf49953aea59c770c255005b177e01f83a9e01a6236d835c1bc652a4d3f01` | `3da7951f0bd7755123afa8383816fcd79d4e4cdfedefa3b43f28b4a732182591` |

The revision's `approved-artifacts.sha256` records the new configuration hash; its own SHA-256
is `c215886664a88d18462e5bbc6ede0ef802dbc97b7cd76f91b37fa080bf07ce0e`.

All original T019 files and amendment revisions 001 and 002 remain unchanged. Harness policy,
active protected-input manifests, acceptance tests, specifications, and thresholds are
unchanged. This supplementary configuration amendment does not alter the active harness
manifest paths.

## Validation

- `npm.cmd run typecheck`: PASS
- `npm.cmd run build`: PASS
- `npm.cmd run lint`: PASS
