# Fork tooling

Personal-fork helpers for `thienlh/paseo`. Upstream is `getpaseo/paseo`.

| Remote   | Repo             |
| -------- | ---------------- |
| `origin` | `getpaseo/paseo` |
| `fork`   | `thienlh/paseo`  |

## Iterate on UX

```bash
npm run dev:desktop
```

Electron with hot reload, backed by its own dev daemon on `127.0.0.1:6768` and
`.dev/paseo-home` in the checkout. The first run copies agent and project metadata from
`~/.paseo`. Your real daemon on `6767` is untouched.

For the browser instead: `npm run dev:server` in one terminal, `npm run dev:app` in another,
then open `http://localhost:8081`.

## Use your build day to day

```bash
scripts/fork/install-desktop.sh
```

Builds the desktop app from the current checkout, quits Paseo, installs the build to
`/Applications/Paseo.app` and relaunches it. Takes several minutes. Flags: `--no-launch`,
`--skip-build`, `--yes`.

- The first run zips the official app to `~/.paseo-fork/Paseo-official.zip`. Restore it
  with `ditto -x -k ~/.paseo-fork/Paseo-official.zip /Applications`.
- The build keeps upstream's version number. The desktop app restarts the daemon when the
  versions differ, which stops running agents, so the script asks first when that will happen.
- The installed daemon keeps running across reinstalls. App-only changes take effect
  immediately. Server changes need a daemon restart, which stops running agents.
- The updater points at a feed that doesn't exist, so official releases never replace your build.
  Run `sync-upstream.sh` and reinstall to pick up upstream changes.

## Stay current with upstream

```bash
scripts/fork/sync-upstream.sh
```

Rebases `main` onto `origin/main` and force-pushes it to `fork`. Run it from a clean `main`.
