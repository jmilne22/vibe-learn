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
