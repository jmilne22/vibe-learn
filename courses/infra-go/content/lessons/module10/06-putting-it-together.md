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
