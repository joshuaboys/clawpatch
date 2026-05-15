# Reporting

`clawpatch report` renders current findings.

```bash
clawpatch report
clawpatch report -o report.md
clawpatch report --json
```

Markdown output includes:

- title, category, severity, confidence, and status
- feature ID
- reasoning text

`review` also writes a Markdown report for each run under:

```text
.clawpatch/reports/<runId>.md
```

Filtering by severity, category, confidence, status, or feature is not
implemented yet.
