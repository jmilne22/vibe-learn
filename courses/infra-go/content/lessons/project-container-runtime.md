Build a minimal container runtime using Linux namespaces and cgroups. Run a process in an isolated environment with resource limits.

---

## What You're Building

A `contain` command that:
- Takes a command and rootfs path as arguments
- Creates new Linux namespaces (PID, UTS, mount, net)
- Sets up filesystem isolation with pivot_root
- Mounts /proc inside the container
- Applies cgroup resource limits (memory, CPU)
- Sets a hostname for the isolated environment
- Runs the specified command in this isolated context

## Why This Project

This project connects Linux isolation primitives to Go code: namespaces, cgroups, pivot_root, process execution, and cleanup. It is Linux-specific and uses real kernel features, so it gives you a concrete way to inspect the mechanics behind container runtimes.

## Usage

```bash
# Run a shell in an isolated container
sudo ./contain run --rootfs /path/to/alpine-rootfs -- /bin/sh

# Run with memory limit
sudo ./contain run --rootfs ./rootfs --memory 64M -- /bin/sh

# Run with CPU and PID limits
sudo ./contain run --rootfs ./rootfs --memory 128M --cpu 50000 --pids 64 -- /bin/sh

# Run a specific command
sudo ./contain run --rootfs ./rootfs --hostname mycontainer -- /bin/echo "hello from container"
```

## Getting a Root Filesystem

You need a minimal Linux rootfs to use as the container's filesystem. Alpine is perfect:

```bash
# Download and extract Alpine mini root filesystem
mkdir rootfs
curl -o alpine.tar.gz https://dl-cdn.alpinelinux.org/alpine/v3.19/releases/x86_64/alpine-minirootfs-3.19.0-x86_64.tar.gz
tar -xzf alpine.tar.gz -C rootfs
```

## Expected Output

```
$ sudo ./contain run --rootfs ./rootfs --memory 64M --hostname sandbox -- /bin/sh

[contain] creating namespaces: pid uts mnt
[contain] setting hostname: sandbox
[contain] setting up rootfs: ./rootfs
[contain] pivoting root
[contain] mounting /proc
[contain] applying cgroup limits: memory=64M
[contain] running: /bin/sh

/ # hostname
sandbox
/ # ps aux
PID   USER     TIME  COMMAND
    1 root      0:00 /bin/sh
    2 root      0:00 ps aux
/ # cat /proc/self/cgroup
0::/
/ # ls /
bin    dev    etc    home   lib    media  mnt    opt    proc   root   run    sbin   srv    sys    tmp    usr    var
/ # exit

[contain] container exited: exit status 0
[contain] cleaning up cgroups
```

## Requirements

### Core

- **CLI parsing:** Use `os.Args` or the `flag` package. The program needs a `run` subcommand with flags for `--rootfs`, `--memory`, `--cpu`, `--pids`, and `--hostname`.
- **Re-exec pattern:** The program must fork itself with a special subcommand (e.g., `child`) to perform setup inside the new namespaces. This is the standard pattern — you can't set up the new mount namespace from the parent.
  ```go
  // Parent: create namespaces, re-exec into them
  cmd := exec.Command("/proc/self/exe", append([]string{"child"}, args...)...)
  cmd.SysProcAttr = &syscall.SysProcAttr{
      Cloneflags: syscall.CLONE_NEWPID | syscall.CLONE_NEWUTS | syscall.CLONE_NEWNS,
  }

  // Child: now inside new namespaces, set up the environment
  ```
- **Namespace creation:** Create new PID, UTS, and mount namespaces using `Cloneflags` on `exec.Cmd.SysProcAttr`.
- **Hostname:** Set the hostname inside the UTS namespace using `syscall.Sethostname`.
- **Filesystem isolation:**
  1. Mount the rootfs directory
  2. Create an `oldroot` directory inside
  3. Call `syscall.PivotRoot(rootfs, oldroot)` to swap roots
  4. `os.Chdir("/")` into the new root
  5. Unmount and remove the old root
- **Mount /proc:** Mount a new proc filesystem so `ps` works inside the container:
  ```go
  syscall.Mount("proc", "/proc", "proc", 0, "")
  ```
- **Cgroup v2 resource limits:** Write limits to the cgroup filesystem:
  - Memory: write to `memory.max` in `/sys/fs/cgroup/<name>/`
  - CPU: write to `cpu.max` (e.g., `"50000 100000"` for 50% CPU)
  - PIDs: write to `pids.max`
  - Add the child process to the cgroup by writing its PID to `cgroup.procs`
- **Cleanup:** Remove the cgroup directory on exit. Use `defer` to ensure cleanup runs.

### Namespace Flags

| Flag | Constant | What It Isolates |
|---|---|---|
| PID | `CLONE_NEWPID` | Process IDs — container sees PID 1 |
| UTS | `CLONE_NEWUTS` | Hostname — container gets its own |
| Mount | `CLONE_NEWNS` | Mounts — container has its own mount table |
| Net | `CLONE_NEWNET` | Network — container has its own network stack (stretch goal) |

### Cgroup v2 File Layout

```
/sys/fs/cgroup/contain-<id>/
├── cgroup.procs      ← Write PID here to add process to group
├── memory.max        ← Max memory in bytes (e.g., "67108864" for 64M)
├── cpu.max           ← "quota period" (e.g., "50000 100000" = 50%)
└── pids.max          ← Max number of processes (e.g., "64")
```

### Helper: Parse Memory Strings

```go
func parseMemory(s string) (int64, error) {
    s = strings.TrimSpace(s)
    multipliers := map[byte]int64{'K': 1024, 'M': 1024 * 1024, 'G': 1024 * 1024 * 1024}
    if len(s) == 0 {
        return 0, fmt.Errorf("empty memory string")
    }
    last := s[len(s)-1]
    if m, ok := multipliers[last]; ok {
        n, err := strconv.ParseInt(s[:len(s)-1], 10, 64)
        return n * m, err
    }
    return strconv.ParseInt(s, 10, 64)
}
```

## Suggested Structure

```
contain/
├── main.go           ← CLI entry point, run vs child dispatch
├── container.go      ← Namespace setup, re-exec, run the command
├── filesystem.go     ← pivot_root, mount /proc, unmount old root
├── cgroup.go         ← Create cgroup, write limits, cleanup
├── cgroup_test.go    ← Test memory parsing, limit file generation
└── rootfs/           ← Alpine mini rootfs (not committed to git)
```

## Hints

> **Suggested approach:**
>
> 1. Start with the re-exec pattern: parent creates a child process, child prints "hello from child" — verify it works
> 2. Add `CLONE_NEWUTS` and set the hostname — verify with `hostname` command
> 3. Add `CLONE_NEWPID` — verify child sees itself as PID 1
> 4. Add filesystem isolation: `pivot_root` into the Alpine rootfs
> 5. Mount `/proc` — verify `ps` shows only the container's processes
> 6. Add cgroup memory limits — verify by allocating memory beyond the limit
> 7. Add CPU and PID limits
> 8. Add cleanup logic with `defer`

### Testing Memory Limits

```bash
# Inside the container, try to allocate more than the limit
/ # dd if=/dev/zero of=/dev/null bs=1M count=200
# Should be killed by OOM if memory limit is set below 200M
```

### Testing PID Limits

```bash
# Inside the container, try to fork-bomb (safely!)
/ # for i in $(seq 1 100); do sleep 100 & done
# Should fail after hitting the pids.max limit
```

### Debugging Tips

```bash
# Check what namespaces a process is in
ls -la /proc/self/ns/

# Check cgroup membership
cat /proc/self/cgroup

# Verify cgroup limits are applied
cat /sys/fs/cgroup/contain-*/memory.max
```

## Safety Notes

- **This project requires root.** `sudo` is necessary for namespace creation and pivot_root. Always test in a VM or disposable environment — never on your daily machine.
- **Use a VM or cloud instance.** A cheap VPS or a local VM (Multipass, Vagrant, VirtualBox) is ideal. If something goes wrong with mount namespaces, you could leave stale mounts.
- **Always clean up cgroups.** If your program crashes, leftover cgroup directories in `/sys/fs/cgroup/` need manual removal with `rmdir`.
- **Don't add `CLONE_NEWNET` until you're comfortable.** Without network setup, the container has no network. Add it as a stretch goal with veth pairs.
- **The rootfs is read-write.** Your container can modify files in the rootfs directory. Use a fresh copy for testing or make it read-only.

## Testing

Some parts (namespace creation, pivot_root) require root and are hard to unit test. Focus tests on the pure logic:

```go
func TestParseMemory(t *testing.T) {
    tests := []struct {
        input string
        want  int64
    }{
        {"64M", 67108864},
        {"1G", 1073741824},
        {"512K", 524288},
        {"1048576", 1048576},
    }
    for _, tt := range tests {
        t.Run(tt.input, func(t *testing.T) {
            got, err := parseMemory(tt.input)
            if err != nil {
                t.Fatal(err)
            }
            if got != tt.want {
                t.Errorf("parseMemory(%q) = %d, want %d", tt.input, got, tt.want)
            }
        })
    }
}

func TestCgroupPaths(t *testing.T) {
    cg := newCgroup("test-container")
    if cg.path != "/sys/fs/cgroup/contain-test-container" {
        t.Errorf("unexpected cgroup path: %s", cg.path)
    }
}

func TestCPUMaxFormat(t *testing.T) {
    // 50% CPU = "50000 100000"
    got := formatCPUMax(50000)
    want := "50000 100000"
    if got != want {
        t.Errorf("formatCPUMax(50000) = %q, want %q", got, want)
    }
}
```

For integration testing, write a script that runs the full binary in a VM and checks output:

```bash
#!/bin/bash
# integration_test.sh — run in a VM with root
OUTPUT=$(sudo ./contain run --rootfs ./rootfs --hostname testbox -- /bin/hostname)
if [ "$OUTPUT" != "testbox" ]; then
    echo "FAIL: expected 'testbox', got '$OUTPUT'"
    exit 1
fi
echo "PASS"
```

## Stretch Goals

- **Network namespace with veth pairs:** Create a `CLONE_NEWNET` namespace and set up a veth pair to give the container network access through the host
- **OverlayFS layers:** Use overlayfs to create a copy-on-write layer over the rootfs, so the base image isn't modified
- **Resource usage reporting:** Read `memory.current`, `cpu.stat`, and `pids.current` from the cgroup and display usage on exit
- **Environment variables:** Pass `--env KEY=VALUE` flags into the container
- **Volume mounts:** Support `--volume /host/path:/container/path` bind mounts
- **Container listing:** Track running containers in a state file and support `contain list` and `contain kill`

> **Skills Used:** Syscalls (clone, pivot_root, mount, sethostname), namespaces, cgroups v2, process management, file I/O, exec.Command, SysProcAttr, byte parsing, defer for cleanup, CLI argument handling.
