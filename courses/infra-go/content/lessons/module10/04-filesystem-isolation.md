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
