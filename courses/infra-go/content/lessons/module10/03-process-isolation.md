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
