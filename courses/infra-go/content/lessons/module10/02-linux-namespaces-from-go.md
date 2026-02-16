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

<div class="inline-exercises" data-concept="Namespaces"></div>
