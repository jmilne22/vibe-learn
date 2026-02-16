You've been running containers for years. Now build one. Docker is written in Go for a reason — the syscall interface is clean and the concurrency model fits perfectly.

---

## What a Container Actually Is

A container is **not a VM**. It's a regular Linux process with a restricted view of the system. Three Linux kernel features make this work:

| Feature | What it does | Docker equivalent |
|---|---|---|
| **Namespaces** | Isolate what a process can *see* | `--pid`, `--net`, `--uts` |
| **Cgroups** | Limit what a process can *use* | `--memory`, `--cpus` |
| **Overlay FS** | Layer filesystem images | Image layers, `COPY` in Dockerfile |

```
┌─────────────────────────────────┐
│         Your "Container"        │
│  ┌───────────┐  ┌────────────┐  │
│  │ Namespaces│  │  Cgroups   │  │
│  │ PID, UTS  │  │ Memory:256M│  │
│  │ Mount,Net │  │ CPU: 50%   │  │
│  └───────────┘  └────────────┘  │
│  ┌───────────────────────────┐  │
│  │     Root Filesystem       │  │
│  │  (pivot_root / chroot)    │  │
│  └───────────────────────────┘  │
└─────────────────────────────────┘
       Just a Linux process.
```

**Why this matters:** When a container is "stuck" in production, you're debugging a Linux process. Understanding namespaces and cgroups lets you inspect from the host side when `kubectl exec` fails.

## Linux Namespaces from Go

Namespaces are the core isolation primitive. Each namespace gives a process its own view of a system resource.

### Namespace Types

| Namespace | Flag | Isolates |
|---|---|---|
| PID | `syscall.CLONE_NEWPID` | Process IDs — PID 1 inside container |
| UTS | `syscall.CLONE_NEWUTS` | Hostname and domain name |
| Mount | `syscall.CLONE_NEWNS` | Mount points (filesystem) |
| Network | `syscall.CLONE_NEWNET` | Network interfaces, IPs, routes |
| IPC | `syscall.CLONE_NEWIPC` | System V IPC, POSIX queues |
| User | `syscall.CLONE_NEWUSER` | User and group IDs |

### Creating Namespaces with exec.Cmd

Go's `os/exec` package lets you set namespace flags on child processes:

```go
cmd := exec.Command("/proc/self/exe", "child")
cmd.SysProcAttr = &syscall.SysProcAttr{
    Cloneflags: syscall.CLONE_NEWPID |
                syscall.CLONE_NEWUTS |
                syscall.CLONE_NEWNS,
}
cmd.Stdin = os.Stdin
cmd.Stdout = os.Stdout
cmd.Stderr = os.Stderr

if err := cmd.Run(); err != nil {
    log.Fatal(err)
}
```

**The re-exec pattern:** `/proc/self/exe` is a symlink to the current binary. We re-execute ourselves with a different argument (`"child"`) to run code inside the new namespaces. This is how Docker and runc work.

```go
func main() {
    switch os.Args[1] {
    case "run":
        parent()  // sets up namespaces, re-execs as "child"
    case "child":
        child()   // runs inside namespaces
    default:
        log.Fatal("unknown command")
    }
}
```

## Process Isolation

### Running in a New PID Namespace

With `CLONE_NEWPID`, the child process becomes PID 1 in its own namespace:

```go
func child() {
    fmt.Printf("PID as seen inside: %d\n", os.Getpid()) // prints 1

    // Set hostname in our new UTS namespace
    syscall.Sethostname([]byte("container"))

    // Run the user's command
    cmd := exec.Command(os.Args[2], os.Args[3:]...)
    cmd.Stdin = os.Stdin
    cmd.Stdout = os.Stdout
    cmd.Stderr = os.Stderr
    cmd.Run()
}
```

### What PID 1 Means

Inside a PID namespace, your process is PID 1 — the init process. This has consequences:

- PID 1 doesn't get default signal handling (SIGTERM won't kill it unless you handle it)
- Orphaned child processes get reparented to PID 1
- If PID 1 exits, all processes in the namespace are killed

This is why containers need proper signal handling — and why `tini` or `dumb-init` exist.

### Viewing Namespaces

From the host, you can inspect namespaces:

```bash
# See namespaces of a process
ls -la /proc/<pid>/ns/

# Enter a running container's namespaces
nsenter --target <pid> --mount --uts --ipc --net --pid
```

This is what `docker exec` and `kubectl exec` do under the hood.

## Filesystem Isolation

### pivot_root: Changing the Root

`chroot` changes the apparent root, but processes can escape it. `pivot_root` is the real deal — it swaps the root mount:

```go
func setupRootfs(newRoot string) error {
    // Mount the new root as a bind mount (pivot_root requires this)
    if err := syscall.Mount(newRoot, newRoot, "", syscall.MS_BIND|syscall.MS_REC, ""); err != nil {
        return fmt.Errorf("bind mount: %w", err)
    }

    // Create the old_root directory inside new root
    oldRoot := filepath.Join(newRoot, ".old_root")
    os.MkdirAll(oldRoot, 0700)

    // Pivot: new root becomes /, old root moves to .old_root
    if err := syscall.PivotRoot(newRoot, oldRoot); err != nil {
        return fmt.Errorf("pivot_root: %w", err)
    }

    // Change to new root
    os.Chdir("/")

    // Unmount old root
    if err := syscall.Unmount("/.old_root", syscall.MNT_DETACH); err != nil {
        return fmt.Errorf("unmount old root: %w", err)
    }
    os.RemoveAll("/.old_root")
    return nil
}
```

### Mounting /proc

After pivoting the root, you need to mount `/proc` for process tools to work:

```go
func mountProc() error {
    os.MkdirAll("/proc", 0755)
    return syscall.Mount("proc", "/proc", "proc", 0, "")
}
```

Without this, `ps`, `top`, and anything reading `/proc` fails inside the container.

### A Minimal Rootfs

You can create a minimal root filesystem with Alpine:

```bash
# Download Alpine mini root filesystem
mkdir -p /tmp/rootfs
curl -sL https://dl-cdn.alpinelinux.org/alpine/v3.19/releases/x86_64/alpine-minirootfs-3.19.0-x86_64.tar.gz | tar xz -C /tmp/rootfs
```

Or build one from your Go binary:

```go
// For a static Go binary, you only need the binary + /proc
// No libc, no shell needed
```

This is why Go is perfect for containers — static binaries with no dependencies.

## Cgroups: Resource Limits

Cgroups (control groups) limit how much of each resource a process can use.

### Cgroup v2 Filesystem

Modern Linux uses cgroup v2 (unified hierarchy):

```
/sys/fs/cgroup/
├── system.slice/
├── user.slice/
└── mycontainer/          ← you create this
    ├── cgroup.procs      ← PIDs in this group
    ├── memory.max        ← memory limit
    ├── cpu.max           ← CPU limit
    ├── memory.current    ← current memory usage
    └── pids.max          ← max number of processes
```

### Setting Memory Limits

```go
func setCgroupMemory(cgroupPath string, limitBytes int64) error {
    // Create cgroup directory
    if err := os.MkdirAll(cgroupPath, 0755); err != nil {
        return err
    }

    // Set memory limit
    memPath := filepath.Join(cgroupPath, "memory.max")
    if err := os.WriteFile(memPath, []byte(fmt.Sprintf("%d", limitBytes)), 0644); err != nil {
        return fmt.Errorf("set memory limit: %w", err)
    }

    // Add current process to cgroup
    procsPath := filepath.Join(cgroupPath, "cgroup.procs")
    return os.WriteFile(procsPath, []byte(fmt.Sprintf("%d", os.Getpid())), 0644)
}

// Usage: limit to 256MB
setCgroupMemory("/sys/fs/cgroup/mycontainer", 256*1024*1024)
```

### Setting CPU Limits

CPU limits use the `cpu.max` file with format `quota period` (microseconds):

```go
func setCgroupCPU(cgroupPath string, cpuPercent int) error {
    // 50% CPU = quota 50000, period 100000
    period := 100000
    quota := period * cpuPercent / 100

    cpuPath := filepath.Join(cgroupPath, "cpu.max")
    value := fmt.Sprintf("%d %d", quota, period)
    return os.WriteFile(cpuPath, []byte(value), 0644)
}
```

### Setting Process Limits

Prevent fork bombs:

```go
func setCgroupPids(cgroupPath string, maxPids int) error {
    pidsPath := filepath.Join(cgroupPath, "pids.max")
    return os.WriteFile(pidsPath, []byte(fmt.Sprintf("%d", maxPids)), 0644)
}
```

### Reading Current Usage

```go
func readCgroupMemory(cgroupPath string) (int64, error) {
    data, err := os.ReadFile(filepath.Join(cgroupPath, "memory.current"))
    if err != nil {
        return 0, err
    }
    return strconv.ParseInt(strings.TrimSpace(string(data)), 10, 64)
}
```

### Cleanup

Always clean up cgroup directories when the container exits:

```go
func cleanupCgroup(cgroupPath string) error {
    return os.Remove(cgroupPath) // only works when cgroup is empty (no processes)
}
```

## Putting It Together

A minimal container runtime in ~100 lines:

```go
func parent() {
    cmd := exec.Command("/proc/self/exe", append([]string{"child"}, os.Args[2:]...)...)
    cmd.SysProcAttr = &syscall.SysProcAttr{
        Cloneflags: syscall.CLONE_NEWPID |
                    syscall.CLONE_NEWUTS |
                    syscall.CLONE_NEWNS,
    }
    cmd.Stdin = os.Stdin
    cmd.Stdout = os.Stdout
    cmd.Stderr = os.Stderr
    cmd.Run()
}

func child() {
    // Set hostname
    syscall.Sethostname([]byte("container"))

    // Set up cgroups
    cgroupPath := "/sys/fs/cgroup/minicontainer"
    setCgroupMemory(cgroupPath, 256*1024*1024) // 256MB
    setCgroupPids(cgroupPath, 64)

    // Set up filesystem
    setupRootfs("/tmp/rootfs")
    mountProc()

    // Run the command
    cmd := exec.Command(os.Args[2], os.Args[3:]...)
    cmd.Stdin = os.Stdin
    cmd.Stdout = os.Stdout
    cmd.Stderr = os.Stderr

    if err := cmd.Run(); err != nil {
        fmt.Println("error:", err)
    }

    // Cleanup
    syscall.Unmount("/proc", 0)
    cleanupCgroup(cgroupPath)
}
```

Run it: `sudo go run main.go run /bin/sh`

You now have a shell running in an isolated PID namespace, with its own hostname, limited to 256MB of memory, with a separate root filesystem. That's a container.

---

## Exercises

Practice individual concepts with quick drills, then tackle multi-step challenges.

<div id="warmups-container">
    <noscript><p class="js-required">JavaScript is required for the interactive exercises.</p></noscript>
</div>

### Challenges

Apply what you learned to infra-themed problems. Each challenge has multiple variants — shuffle to keep things fresh.

<div id="challenges-container">
    <noscript><p class="js-required">JavaScript is required for the interactive exercises.</p></noscript>
</div>
