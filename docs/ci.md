# CI and releases

Automatic CI is intentionally small. `.github/workflows/verify.yml` runs one Linux job on pull requests and pushes to `main`. It installs Node 24, Go and Rust, then runs `npm run verify`: types, lint, content validation, platform tests, production builds and browser tests. A failed run uploads test diagnostics for seven days.

A successful push to `main` also deploys the built `dist/` directory to GitHub Pages. PRs never deploy. In repository Settings → Pages, use GitHub Actions as the publishing source. The `github-pages` environment must allow `main`. Deployment permissions are confined to the deployment job. See the [GitHub Pages workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

Desktop packaging is separate and only runs from **Actions → Build desktop installers → Run workflow**, or when a `v*` tag is pushed. It builds Windows, macOS and Linux installers, launches each packaged app for a smoke check, and uploads the installers for 14 days. It does not repeat the full test suite on every OS or run on ordinary PRs.

Before opening a PR, run `npm run verify`. For desktop changes, also run the development smoke; for runtime/dependency changes, package and smoke-test the package. Browser tests use port 5174 so the preview on 5173 can remain open. All desktop smoke tests use a temporary profile and remove it afterward.

To publish a release after testing, set the package version and lockfile version together, merge the change, then push a matching tag such as `v2.0.0`. The workflow rejects a tag that does not match `package.json`. After all installer builds and smoke checks pass, the release job creates a GitHub release with the installers. A manual workflow run produces downloadable artifacts without publishing a release. No release is created just by merging a PR.

Current installer builds are unsigned. Signing and notarization require separate credentials and setup described in [desktop packaging](desktop-packaging.md). Neither is claimed to be configured by this workflow.
