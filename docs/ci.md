# CI and releases

Automatic CI is intentionally small. `.github/workflows/verify.yml` runs one Linux job on pull requests and pushes to `main`. It installs Node 24, Go and Rust, then runs `npm run verify`: types, lint, content validation, platform tests, production builds and browser tests. A failed run uploads test diagnostics for seven days.

A successful push to `main` also deploys the built `dist/` directory to GitHub Pages. PRs never deploy. In repository Settings → Pages, use GitHub Actions as the publishing source. The `github-pages` environment must allow `main`. Deployment permissions are confined to the deployment job. See the [GitHub Pages workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

Desktop packaging is separate and only runs from **Actions → Build desktop installers → Run workflow**, or when a `v*` tag is pushed. It builds Windows, macOS and Linux installers, launches each packaged app for a smoke check, and uploads the installers for 14 days. It does not repeat the full test suite on every OS or run on ordinary PRs.

Before opening a PR, run `npm run verify`. For desktop changes, also run the development smoke; for runtime/dependency changes, package and smoke-test the package. Browser tests use port 5174 so the preview on 5173 can remain open. All desktop smoke tests use a temporary profile and remove it afterward.

To publish a release after testing, set the package version and lockfile version together, merge the change, then push a matching tag such as `v2.0.0`. The workflow rejects a tag that does not match `package.json`. After all installer builds and smoke checks pass, the release job creates a GitHub release with the installers. A manual workflow run produces downloadable artifacts without publishing a release. No release is created just by merging a PR.

Current installer builds are unsigned. Signing and notarization require separate credentials and setup described in [desktop packaging](desktop-packaging.md). Neither is claimed to be configured by this workflow.

Windows packaging uses the `windows-2022` runner with Visual Studio 2022. Electron's current native-module build tooling does not recognize Visual Studio 2026 on `windows-latest`.

## Updating content without an installer

Merge course or project changes to `main`. The existing Verify/Pages workflow builds and publishes the catalog plus its update manifest. In Vibe Learn 2.0.3 or newer, choose **Settings & backups → Update content** after the Pages deployment succeeds. Reading then uses the saved catalog offline. No version bump, installer build, extra CI job, or GitHub release is needed for ordinary content edits.

App code changes also reach installed apps without a release: on pushes to `main`, Verify signs and publishes the built app code to `updates/app/` (the `APP_UPDATE_SIGNING_KEY` secret must exist; without it the step warns and publishes nothing). Users choose **Settings & backups → Update app** and restart. Changes to Electron, production dependencies the main process loads, or the bundled Go toolchain still require a desktop release; the app detects the first two and asks for an installer.

Native dependencies or built-in runner changes still require a desktop release. Set `MINIMUM_CONTENT_APP_VERSION` in `src/shared/content-update.ts` to the first app version that supports newly required content behaviour. Update the supported built-in check versions in `src/content/validate-catalog.ts` when changing a suite. Keep course/project/section/activity IDs stable across edits.

Version 2.0.3 introduces the content updater; 2.0.1 installations need that one-time app upgrade. The app updater arrives in the release after 2.0.3, which likewise needs one manual install. Publishing the Pages catalog alone cannot add the updater to an old binary.
