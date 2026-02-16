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

<div class="inline-exercises" data-concept="Cgroups"></div>
