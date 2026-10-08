//go:build ignore

// Tests for the doctor.go that the admission lab supplies. The vitest suite
// copies this file and the shipped doctor.go into a temporary module, removes
// the ignore build tag from both, and runs "go test" there.
package main

import (
	"encoding/json"
	"errors"
	"os"
	"slices"
	"strings"
	"testing"
	"time"
)

type fake struct {
	missing      []string
	absent       bool
	brokenDocker bool
	skew         bool
	unready      bool
	oldGo        bool
}

func (f fake) check(t *testing.T, args ...string) (int, string) {
	t.Helper()
	var calls [][]string
	lookPath = func(name string) (string, error) {
		if slices.Contains(f.missing, name) {
			return "", errors.New("not found")
		}
		return "/bin/" + name, nil
	}
	goVersion = func() string {
		if f.oldGo {
			return "go1.21.13"
		}
		return "go1.26.8"
	}
	run = func(args ...string) (int, string, string) {
		calls = append(calls, args)
		switch {
		case hasPrefix(args, "docker", "info"):
			if f.brokenDocker {
				return 1, "", "permission denied while trying to connect to the docker API"
			}
			return 0, "29.8.1", ""
		case hasPrefix(args, "k3d", "cluster", "list"):
			if f.absent {
				return 0, "[]", ""
			}
			return 0, `[{"name":"admission-lab"}]`, ""
		case args[0] == "kubectl" && slices.Contains(args, "--context") && slices.Contains(args, "version"):
			server := "v1.37.1+k3s1"
			if f.skew {
				server = "v1.32.5+k3s1"
			}
			out, _ := json.Marshal(map[string]any{
				"clientVersion": map[string]string{"gitVersion": "v1.37.1"},
				"serverVersion": map[string]string{"gitVersion": server},
			})
			return 0, string(out), ""
		case args[0] == "kubectl" && slices.Contains(args, "--context"):
			status := "True"
			if f.unready {
				status = "False"
			}
			node := map[string]any{"status": map[string]any{"conditions": []map[string]string{{"type": "Ready", "status": status}}}}
			out, _ := json.Marshal(map[string]any{"items": []any{node, node}})
			return 0, string(out), ""
		case args[0] == "df":
			return 0, "Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/x 100 1 20971520 1% /", ""
		}
		return 0, "version ok", ""
	}
	var out strings.Builder
	status := doctorMain(args, &out)
	for _, call := range calls {
		for _, word := range []string{"create", "apply", "delete", "use-context", "label", "patch"} {
			if slices.Contains(call, word) {
				t.Errorf("doctor ran a command that changes state: %v", call)
			}
		}
	}
	return status, out.String()
}

func hasPrefix(args []string, prefix ...string) bool {
	return len(args) >= len(prefix) && slices.Equal(args[:len(prefix)], prefix)
}

func expect(t *testing.T, text string, parts ...string) {
	t.Helper()
	for _, part := range parts {
		if !strings.Contains(text, part) {
			t.Errorf("output does not contain %q:\n%s", part, text)
		}
	}
}

func TestMissingToolsDoNotStopOtherChecks(t *testing.T) {
	status, text := fake{missing: []string{"task", "openssl"}}.check(t)
	if status != 1 {
		t.Fatalf("status = %d, want 1", status)
	}
	expect(t, text, "FAIL: task: not found on PATH.", "FAIL: openssl: not found on PATH.", "2 of 2 nodes are Ready", "2 blocking problem(s)")
}

func TestDockerDaemonAccess(t *testing.T) {
	status, text := fake{brokenDocker: true}.check(t)
	if status != 1 {
		t.Fatalf("status = %d, want 1", status)
	}
	expect(t, text, "Docker daemon: not reachable", "the Docker daemon runs", "socket")
}

func TestAbsentClusterIsNextUntilReady(t *testing.T) {
	status, text := fake{absent: true}.check(t)
	if status != 0 {
		t.Fatalf("status = %d, want 0:\n%s", status, text)
	}
	expect(t, text, "NEXT: Cluster admission-lab: not found.")
	status, text = fake{absent: true}.check(t, "--ready")
	if status != 1 {
		t.Fatalf("--ready status = %d, want 1", status)
	}
	expect(t, text, "FAIL: Cluster admission-lab: not found.")
}

func TestVersionSkew(t *testing.T) {
	status, text := fake{skew: true}.check(t)
	if status != 1 {
		t.Fatalf("status = %d, want 1", status)
	}
	expect(t, text, "within one minor version")
}

func TestOldGo(t *testing.T) {
	status, text := fake{oldGo: true}.check(t)
	if status != 1 {
		t.Fatalf("status = %d, want 1", status)
	}
	expect(t, text, "Go 1.21 is too old")
}

func TestHealthyAndUnreadyNodes(t *testing.T) {
	if status, text := (fake{}).check(t, "--ready"); status != 0 {
		t.Fatalf("healthy status = %d, want 0:\n%s", status, text)
	}
	status, text := fake{unready: true}.check(t)
	if status != 1 {
		t.Fatalf("unready status = %d, want 1", status)
	}
	expect(t, text, "0 of 2 nodes are Ready")
}

// TestRunStopsSlowCommands starts this test binary again as a slow child.
func TestRunStopsSlowCommands(t *testing.T) {
	if os.Getenv("DOCTOR_SLOW_CHILD") == "1" {
		time.Sleep(10 * time.Second)
		return
	}
	t.Setenv("DOCTOR_SLOW_CHILD", "1")
	timeout = 200 * time.Millisecond
	started := time.Now()
	code, _, errText := runCommand(os.Args[0], "-test.run=^TestRunStopsSlowCommands$")
	if code != 1 || !strings.Contains(errText, "stopped after") {
		t.Fatalf("runCommand = %d %q, want 1 and a timeout message", code, errText)
	}
	if elapsed := time.Since(started); elapsed > 5*time.Second {
		t.Fatalf("runCommand took %s", elapsed)
	}
}
