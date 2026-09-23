# Go and Infrastructure Engineering

A 30-hour core for an infrastructure engineer learning to write Go independently, with practical Kubernetes/Terraform refreshers. The role linked in the first lesson informs the topics; the course does not claim employer affiliation or knowledge of its interview questions.

- Eight modules / 22 sections, 12 distinct Go exercises, 20 optional flashcards.
- Three guided local labs: Kubernetes rollout/routing, Terraform state/drift, Collector buffering/recovery.
- All course content and exercise checks are readable offline. Lab images/tools/providers need an initial download.
- Existing projects are optional follow-ons and remain unchanged. No course completion gates or Kubernetes grading suite.

## Authoring and verification

`content/exercises.yaml` includes each exercise's contract, hints, and full solution. Canonical Go solutions also live in `validation/solutions/<id>/`; `npm run verify:course` rejects differences between the tested source and displayed solution.

Run from the repository root with Go 1.26+:

```sh
npm run verify:course
npm run verify:course -- --race
npm run verify
```

The course command tests copies in a temporary directory, checks that each starter fails `TestContract` without compilation errors/panics/timeouts, and runs every reference solution offline. Race mode requires a host C compiler and enables cgo for reference solutions only. It does not change the desktop runner. Labs are verified manually, not added to CI.

`labs/` contains the source files used in the three external labs. The file-reference lessons contain exact copies so desktop readers can reconstruct them offline. The course verifier checks these copies too. When editing a fixture, update the corresponding fenced source in the lesson. The fixture discards OTLP payloads and counts batches; it is deliberately not a storage backend.

See [validation record](validation/README.md) for executed versions and observations. The opening module and HTTP exercise set the editorial model: specify the decision, show how to begin, work through evidence, then ask for an implementation. Exercises vary in purpose rather than offering renamed variants.

## Delivery

This course is compiled into the app. Merging publishes it to the read-only website preview through existing CI. Installed desktop apps receive it only in a subsequent desktop release; this change does not publish one automatically.
