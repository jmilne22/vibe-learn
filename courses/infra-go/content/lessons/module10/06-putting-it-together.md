## Putting It Together

<attempt type="worked">

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

</attempt>

<attempt type="gaps">

<gaps prompt="The child sequence, from memory — limits before user code, /proc after the pivot, teardown last.">
```go
func child() {
    syscall.Sethostname([]byte("container"))

    cgroupPath := "/sys/fs/cgroup/minicontainer"
    «setCgroupMemory»(cgroupPath, 256*1024*1024)
    setCgroupPids(cgroupPath, 64)

    setupRootfs("/tmp/rootfs")
    «mountProc»()

    cmd := exec.Command(os.Args[2], os.Args[3:]...)
    cmd.Run()

    syscall.Unmount(«"/proc"», 0)
    «cleanupCgroup»(cgroupPath)
}
```
</gaps>

</attempt>

---

### Ship your project: Mini Container Runtime

Take what this module built up and make it a real tool: [Project 4: Mini Container Runtime](project-container-runtime.html), four milestones from re-exec skeleton to cgroup limits with cleanup. Work in a VM, ship it with the safety notes in its README — four of five.
