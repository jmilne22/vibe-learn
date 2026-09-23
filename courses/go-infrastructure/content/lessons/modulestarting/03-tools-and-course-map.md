## Tools and setup

The Go exercises use the app's bundled toolchain and standard library. Edit the source files in your editor, then press **Run checks**.

For commands in an external terminal, use Go 1.26 or later. On this repository's NixOS development environment, `nix-shell` supplies Go and build tools. Outside the repository, `nix-shell -p go gcc` provides a host toolchain; check `go version` rather than assuming the shell's version. Race checks need cgo and a C compiler; normal app checks do not.

### A suggested route

| Material | Budget including practice |
|---|---:|
| Starting a program; reading input | 7 hours |
| HTTP; cancellation and concurrency | 9 hours |
| Kubernetes; Terraform; telemetry | 11 hours |
| Independent CLI | 3 hours |

The optional extensions are outside these estimates. If the interview arrives early, keep the independent CLI and the three lab investigations; omit the extensions.

### Local labs

The lab recipes use Bash on Linux or macOS; on Windows use a Linux environment such as WSL with Docker access. The recorded execution was on Linux/NixOS. You need Docker Engine with Compose, curl, and these pinned tools:

| Tool | Tested version |
|---|---|
| Go | 1.26.7 |
| kind | 0.33.0 |
| Kubernetes node image | `kindest/node:v1.35.0` |
| kubectl | 1.35.0 |
| Helm | 3.19.0 |
| Terraform | 1.14.7 |
| Terraform local provider | 2.7.0 |
| OpenTelemetry Collector | 0.148.0 |

Initial tool, provider, and image downloads need the network. The cluster and containers consume memory and disk; run one lab at a time on a smaller machine. No cloud account or vendor account is used.

Install platform-appropriate binaries using the official [kind](https://kind.sigs.k8s.io/docs/user/quick-start/), [kubectl](https://kubernetes.io/docs/tasks/tools/), [Helm](https://helm.sh/docs/intro/install/), and [Terraform](https://developer.hashicorp.com/terraform/install) instructions, selecting the versions above. On NixOS the official static Go-based CLI binaries can be used from a directory on PATH; install the lab tools separately from the repository shell.

### Make an isolated lab directory

From a repository checkout containing this course:

```sh
LAB_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/vibe-course.XXXXXX")
export LAB_ROOT
cp -R courses/go-infrastructure/labs/. "$LAB_ROOT/"
```

If you only have the desktop app, create the same directory structure using the complete files in the Kubernetes, Terraform, and telemetry file-reference sections. Those files are included in the offline lesson text.

Build the supplied fixture once for Kubernetes and telemetry:

```sh
cd "$LAB_ROOT/fixture"
CGO_ENABLED=0 GOOS=linux go build -o server .
docker build -t vibe-course-fixture:1 .
```

The Dockerfile copies this static binary into a scratch image. On an Apple Silicon host, Go produces an arm64 binary by default and Docker/kind must also use arm64. Do not force an amd64 container around an arm64 binary. The fixture listens on port 8080 and has no shell inside it.

The fixture's `/control` endpoint intentionally has no authentication. It is for this isolated lab. Compose binds host ports to loopback; do not deploy the fixture on a public server.

Keep this directory for the labs. Each lab ends with cleanup commands.
