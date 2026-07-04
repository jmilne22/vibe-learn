# Desktop packaging

The Electron app keeps installed assets, learner work, and development state
in separate locations.

## Storage model

| Data | Packaged app | Development app |
| --- | --- | --- |
| Course assets | read-only application resources | repository `dist/` |
| Practice seed | read-only application resources | `build/desktop-resources/practice-seed/` |
| Learner workspace | `Documents/Vibe Learn/workspaces/infra-go/` | `Documents/Vibe Learn Dev/workspaces/infra-go/` |
| Progress and browser state | OS app data under `Vibe Learn` | OS app data under `Vibe Learn Dev` |
| Runner state and caches | profile app data | development profile app data |
| Local port | `4711` | `4712` |

The ignored repository `practice/` directory is used only by the browser/CLI
workflow. Desktop preparation always regenerates a clean seed from course YAML.

Packaged apps ship exactly one course, `VIBE_DESKTOP_COURSE` (default
`infra-go`). The same slug drives dist pruning, practice-seed generation,
and the learner workspace directory (recorded in `metadata.json`). Other
built courses and the web landing page — a download page for the app
itself — are pruned from the packaged assets.

Workspace updates are hash-based. Missing or untouched generated files are
updated; any file changed by the learner is preserved.

## Commands

```bash
npm run app                 # isolated development app
npm run prepare:desktop     # build resources and bundle this platform's Go
npm run package:desktop     # unpacked platform application
npm run make:desktop        # OS installer/distributable
```

Use environment overrides for automated or disposable runs:

```bash
VIBE_USER_DATA_DIR=/tmp/vibe-profile \
VIBE_WORKSPACE_DIR=/tmp/vibe-workspace \
VIBE_PORT=4714 npm run app:dev
```

## Self-contained Go execution

`prepare:desktop` copies the active `GOROOT` into the application resources and
vendors module dependencies into the clean exercise seed. The packaged runner
sets `GOTOOLCHAIN=local` and `GOFLAGS=-mod=vendor`, so it does not download a
toolchain or modules.

Packaged checks omit `-race` because the race detector requires an external C
toolchain on several supported platforms. Development and direct CLI checks
retain `-race`. Set `VIBE_GO_RACE=0` to disable it in source mode.

## Platform outputs

Electron Forge creates:

- Windows: Squirrel installer
- macOS: DMG and ZIP
- Linux: a portable tar.gz that works on any distro (Void, Arch, NixOS,
  ...) — unpack and run `./vibe-learn` — plus DEB and RPM when the host
  has the packaging tools (`dpkg`/`fakeroot`, `rpmbuild`). Missing tools
  skip those makers instead of failing the build.

`.github/workflows/desktop.yml` builds these natively on Windows, macOS, and
Linux and uploads the results as workflow artifacts on pull requests and
pushes to `main`.

## Cutting a release

Pushing a `v*` tag publishes a GitHub release with all installers attached —
this is what the download page's `releases/latest` links resolve to:

```bash
npm version 1.1.0 --no-git-tag-version   # or edit package.json
git commit -am "v1.1.0" && git tag v1.1.0
git push && git push --tags
```

The workflow fails the build if the tag does not match the `package.json`
version, so artifacts can never carry a different version than the release
they are attached to. Re-running a failed release job overwrites existing
assets instead of erroring.

Releases are unsigned until Windows signing credentials and an Apple
Developer ID/notarization credentials are configured; the Forge configuration
reads those values from environment variables and does not store secrets in
the repository.

## Safety boundaries

- Packaged assets are never writable.
- Development cannot reuse the production daemon because profile, port,
  and workspace must all match.
- Renderer sandboxing, context isolation, navigation restrictions, permission
  denial, and IPC sender validation remain enabled.
- External links are opened by the operating system instead of inside the
  privileged application window.
