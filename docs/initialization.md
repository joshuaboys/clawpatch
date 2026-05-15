# Initialization

`clawpatch init` creates project-local state.

```bash
clawpatch init
clawpatch init --force
```

It detects:

- git remote, branch, and head
- project name
- languages
- known frameworks
- package managers
- likely validation commands

It writes:

- `.clawpatch/project.json`
- `.clawpatch/config.json`

`--force` allows replacing the existing project/config detection output. It does
not run review, fix code, commit, or contact any provider.
