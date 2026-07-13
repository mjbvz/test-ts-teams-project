# `@microsoft/teams.graph-endpoints` — TypeScript memory bloat repro

TypeScript project demonstrating how much memory and how many
files a single import of `@microsoft/teams.graph-endpoints` adds to a
TypeScript program, measured with both `tsc` (TypeScript 5.9.3) and `tsgo`
(`@typescript/native-preview` 7.0.0-dev, the native TypeScript compiler /
language server).

## Setup

```bash
npm install
node measure.mjs        # runs all six measurements and prints tables
```

Or run individual probes:

```bash
npx tsgo --noEmit -p tsconfig.baseline.json --extendedDiagnostics
npx tsgo --noEmit -p tsconfig.subpath.json  --extendedDiagnostics
npx tsgo --noEmit -p tsconfig.barrel.json   --extendedDiagnostics
# same with `npx tsc` for the non-native compiler
```

The three probes each compile exactly one small source file:

| Probe | Source file | What it does |
|---|---|---|
| baseline | `src/baseline.ts` | No imports at all (fixed compiler + lib cost) |
| subpath | `src/subpath-import.ts` | `import * as chats from "@microsoft/teams.graph-endpoints/chats"` |
| barrel | `src/barrel-import.ts` | `import { chats, teams } from "@microsoft/teams.graph-endpoints"` |

## Results

Environment: Linux x64, Node v22.14.0, `@microsoft/teams.graph-endpoints@2.0.13`.

### tsgo (`@typescript/native-preview` 7.0.0-dev.20260707.2)

| Probe | Files | Lines | Symbols | Memory | Total time |
|---|---:|---:|---:|---:|---:|
| baseline (no imports) | 64 | 56,148 | 31,631 | 24.5 MB | 0.035s |
| subpath import (chats only) | 73 | 650,944 | 488,918 | 254 MB | 0.38s |
| barrel import (package root) | 1,315 | 736,649 | 560,098 | 343 MB | 0.41s |

### tsc (TypeScript 5.9.3)

| Probe | Files | Lines | Symbols | Memory | Total time |
|---|---:|---:|---:|---:|---:|
| baseline (no imports) | 64 | 51,130 | 29,796 | 58 MB | 0.21s |
| subpath import (chats only) | 73 | 645,926 | 487,083 | 480 MB | 1.12s |
| barrel import (package root) | 1,315 | 731,631 | 558,263 | 604 MB | 1.46s |

### Cost attributable to this one package (probe minus baseline)

| | tsgo | tsc |
|---|---:|---:|
| Single subpath import | **+230 MB**, +9 files, +595k lines | **+422 MB** |
| Root barrel import | **+318 MB**, +1,251 files, +680k lines | **+546 MB** |

Note this is a `--noEmit` batch compile with `skipLibCheck: true` — a
long-lived language server holds at least this much resident per project, and
type instantiation costs (the `Operation<...>` conditional/mapped types) come
on top of it lazily as files using the package are checked.

## Why it is this large

The published package ships 1,251 generated `.d.ts` files totalling ~33 MB of
declaration text. Two structural properties cause the blow-up:

1. **One giant schema file that every import pulls in.**
   `dist/types/types.d.ts` is a single **24.8 MB / 594,162-line** declaration
   file containing the entire Microsoft Graph v1.0 OpenAPI surface: a `paths`
   interface with ~9,800 endpoint entries and a `components` interface with
   every Graph schema type. Every endpoint module imports `Operation` from
   `dist/types/common.ts`, which imports this file — so even the narrowest
   possible subpath import (`@microsoft/teams.graph-endpoints/chats`, 9 extra
   files) forces the compiler to parse and bind all ~595k lines. That is the
   ~230–420 MB floor shown in the subpath row.

2. **The root barrel re-exports everything.**
   `dist/index.d.ts` does `export * as <namespace> from './<namespace>'` for
   all 54 top-level Graph namespaces, and each namespace's `index.d.ts`
   recursively re-exports its children (1,246 `export * as` statements across
   1,249 barrel files). Importing anything from the package root therefore
   adds all 1,251 declaration files to the program — types are not
   tree-shakeable.

### Where the 24.8 MB `types/types.d.ts` goes

| Section | Lines | Size | Share |
|---|---:|---:|---:|
| `operations` interface (per-operation request/response envelopes) | 464,278 | 16.1 MB | 78% |
| `paths` interface (9,814 path entries → `operations[...]` refs) | 74,262 | 4.2 MB | 17% |
| `components` interface (the actual Graph schema types) | 55,620 | 3.4 MB | 14% |

The real schema (`components`) is only 3.4 MB; ~80% of the file is generated
OpenAPI envelope boilerplate around it.

## Suggested mitigations

1. **Generate final operation shapes instead of OpenAPI envelopes.** The
   `operations` interface (16.1 MB, 78% of the file) wraps every one of the
   ~14k operations in the same `parameters/query/header/path/cookie` +
   `responses/'2XX'/headers/content/'application/json'` envelope, which
   `types/common.ts` then unwraps again at use-time with conditional/mapped
   types (`ExtractParameters`, `ExtractRequestBody`, `ExtractResponse`,
   `UnionToIntersection`, `Simplify`). Emitting the already-unwrapped
   `{ parameters, body, response }` shape per operation (or shared generic
   aliases like `GetOp<TSchema>` / `ListOp<TSchema>` / `DeleteOp` for the
   structurally identical CRUD patterns) would eliminate most of the 16.1 MB
   *and* the lazy type-instantiation cost of the extractors.

2. **Split `types/types.d.ts` per namespace.** Every endpoint module imports
   `Operation` from `types/common.ts`, which imports the whole 594k-line file,
   so even `import * as chats from ".../chats"` costs ~230 MB (tsgo) /
   ~420 MB (tsc). If each namespace's operations/schemas lived in their own
   file, subpath imports would only pay for what they use.

3. **Alias duplicated resource trees instead of re-generating them.** The same
   Graph resources are generated once per navigation path: 1,017 of the 9,814
   path entries are `/me/*` duplicates of `/users/{user-id}/*`, and the
   `/teams/*` subtree (~197 paths) is re-generated under
   `/users/{user-id}/joinedTeams/*`, `/me/joinedTeams/*`, and
   `/groups/{group-id}/team/*`. Generating one canonical module per resource
   and re-exporting it would cut both the endpoint file count and the
   `paths`/`operations` entries.

4. **Avoid the recursive root barrel (or document subpath-only imports).**
   `dist/index.d.ts` recursively `export * as`-es all 54 namespaces (1,246
   re-exports across 1,249 barrel files), so importing anything from the
   package root adds all 1,251 declaration files (+90 MB in tsgo over the
   subpath import). Types are not tree-shakeable.

5. **Deduplicate JSDoc.** The same operation description is emitted three
   times: on the `paths` entry, on the `operations` entry, and on the endpoint
   function (in `chats/index.d.ts`, comments are ~60% of the lines). Keeping
   it only on the user-facing endpoint function preserves IntelliSense while
   shrinking all three sections.

6. **Consider splitting the npm package by namespace** (or publishing a
   Teams-focused core of `chats`/`teams`/`teamwork`/`users`). Consumers of a
   Teams SDK rarely need `deviceManagement`, `education`, Excel workbook
   functions, etc.; installed size is currently ~50 MB, of which 31.3 MB is
   `.d.ts` text (runtime JS is only ~5.3 MB across cjs+esm).
