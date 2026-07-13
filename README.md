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
