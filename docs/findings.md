---
title: Findings
description: "Understanding finding records, statuses, and inspection commands"
---

# Findings

Findings are stored in `.clawpatch/findings/<findingId>.json`.

Each finding records:

- feature ID
- title
- category
- severity
- confidence
- triage
- evidence
- reasoning
- reproduction notes
- recommendation
- why included tests do not already cover or define the behavior
- suggested regression test
- minimum fix scope
- status
- linked patch attempts
- triage/revalidation history

Statuses:

- `open`
- `false-positive`
- `fixed`
- `wont-fix`
- `uncertain`

Current ways to inspect findings:

```bash
clawpatch status
clawpatch next
clawpatch show --finding <findingId>
clawpatch report
clawpatch report -o report.md
clawpatch report --json
clawpatch report --status open --severity high
clawpatch report --feature <featureId>
```

Current ways to act on a finding:

```bash
clawpatch triage --finding <findingId> --status false-positive --note "covered by contract test"
clawpatch fix --finding <findingId>
clawpatch revalidate --finding <findingId>
clawpatch revalidate --all --status open --limit 10
```

`next` prioritizes open high/medium-confidence confirmed bugs first, then
security, data-loss, and concurrency findings, then the remaining queue.

`triage` keeps existing finding IDs stable and appends a history entry instead
of replacing previous reasoning.
