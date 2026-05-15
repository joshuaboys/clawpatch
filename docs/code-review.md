# Code Review

`clawpatch review` reviews feature records created by `clawpatch map`.

```bash
clawpatch review --limit 3
clawpatch review --feature <featureId>
clawpatch review --provider codex --model <model>
```

Current behavior:

- selects pending features unless `--feature` is set
- claims each feature with a run lock
- builds bounded prompt context from owned files, context files, and tests
- calls the configured provider
- requires strict JSON output
- writes findings under `.clawpatch/findings/`
- appends analysis history to the feature record
- releases the feature lock

Review is sequential today. There is no worker pool or multi-provider panel yet.

Categories requested from the provider:

- `bug`
- `security`
- `performance`
- `concurrency`
- `api-contract`
- `data-loss`
- `test-gap`
- `docs-gap`
- `build-release`
- `maintainability`

Review does not edit files. Use `clawpatch fix --finding <id>` for the explicit
patch loop.
