# Feature Mapping

`clawpatch map` creates durable feature records under `.clawpatch/features/`.

```bash
clawpatch map
clawpatch map --dry-run
```

A feature is a reviewable slice with:

- title and summary
- kind
- entrypoints
- owned files
- context files
- likely tests
- tags
- trust boundaries
- status and lock metadata

Supported deterministic mappers today:

- npm package bins
- selected package scripts
- Next.js `app/` and `pages/` routes
- Go `cmd/*/main.go`
- Go `internal/*` packages
- Rust Cargo commands, libraries, workspace crates, and integration tests
- SwiftPM executable targets, library targets, and test suites
- common config files

The mapper does not call a model. It uses repo conventions and cheap filesystem
walks, skips symlinked directories, and excludes common generated folders.

Known gaps:

- no Express/Fastify/Hono route mapper yet
- no import graph expansion beyond nearby tests yet
- no agent enrichment yet
