# Course validation — 23 September 2026

## Exercise checks

All 12 starter workspaces compile and fail their intended `TestContract` assertion. All 12 reference solutions pass the visible checks with module downloads disabled and cgo disabled. A separate host run passes all 12 reference solutions with the Go race detector enabled. Displayed solution code is compared with the tested source by `npm run verify:course`.

Go 1.26.7, Linux amd64; race runs use the host C toolchain from the repository's Nix shell. Concurrency tests coordinate with channels and use timeouts only as deadlock guards. The endpoint CLI also exercises an actual HTTP client timeout; it does not assert a precise elapsed duration.

The suite covers boundaries/ownership, malformed input, unknown/trailing JSON, reader failures, HTTP error classification and body closure, readiness changes, cancellation, shared state, bounded work, retry budgets, ordered CLI output, and output errors. Learner-authored tests remain separate; passing these checks is not a correctness proof for arbitrary workloads.

## Executed local labs

Tools: Docker Engine 29.8.0, Compose 5.5.1, kind 0.33.0, Kubernetes node v1.35.0, kubectl 1.35.0, Helm 3.19.0, Terraform 1.14.7, local provider 2.7.0, OpenTelemetry Collector 0.148.0. The fixture was built with Go 1.26.7 and cgo disabled. Lab verification was on Linux/NixOS, not on macOS or Windows.

- Kubernetes: created a fresh kind cluster, loaded the fixture image, installed the chart, and observed a ready Pod. A wrong Service selector removed its endpoints. A bad readiness path left a new Pod at 0/1 while the previous Pod stayed 1/1; rollout status timed out. Restoring the path completed the rollout. Deleting a Pod during a five-second request produced `shutdown started`, `work completed`, and `shutdown complete`; curl exited 0 with `work complete`.
- Terraform: initialized in a fresh temporary directory and created the local file. An external content change produced a create proposal with this provider. After restoring content, renaming the resource without a moved block proposed one destroy and one create. Adding the moved block produced zero creates/changes/destroys and moved state to the new address.
- Telemetry: started fresh Compose services, sent a baseline log, then configured the receiver to return 503. Twelve more producer requests filled the queue to its configured capacity of four; eight were refused in this particular run. Restoring the receiver drained the queue to zero and exported four queued records. The receiver count was five including the earlier baseline. Counts can vary with scheduling; the lesson does not require these exact counts.

Cleanup was executed: the Helm release and named kind cluster were deleted, Compose services/network were removed, and Terraform destroyed the generated file. These are manual authoring checks, not an automated Kubernetes acceptance suite. The fixture counts batches and discards payloads. The lab demonstrates neither durable storage nor exactly-once delivery.

## Platform checks

`npm run verify` passed: TypeScript, ESLint, content validation, 18 platform tests, builds, and five browser tests. The browser coverage opens the real course, an HTTP exercise and its hint, offline lab source, flashcards, and a narrow reading viewport. Source files and rendered lab listings are compared by the course verifier. A separate isolated desktop run prepared the authored HTTP exercise through the UI, observed its starter failure, replaced its source with the reference solution, and observed a passing run through IPC. Existing project documents are unchanged.

Screenshots are captured under the ignored `build/screenshots` directory; selected images for the PR are kept in `docs/screenshots/go-infrastructure`.
