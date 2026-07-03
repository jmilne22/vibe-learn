## Build: Config Linter — Milestone 1

This is the module's real test. No new concepts — everything on this page is Module 1 material aimed at a real file. If any step sends you back to a lesson section, that's the system working.

Create the repo now — this becomes your first shipped tool:

```bash
mkdir configlint && cd configlint
git init
go mod init configlint
```

### The assignment

Write a program that reads a YAML file line by line and reports what's in it. **No structs, no YAML parser, no CLI framework** — `bufio.Scanner`, string functions, maps, and counters.

```bash
go run . deployment.yaml
```

For each file given as an argument (`os.Args[1:]` — a slice of strings, use it like any slice):

1. Count `key: value` pairs (lines containing `:` that aren't comments)
2. Count comment lines (first non-space character is `#`) and blank lines
3. Track the deepest indentation you saw (leading spaces ÷ 2)
4. Print one summary line per file:

```
deployment.yaml: 24 keys, 3 comments, 2 blank, max depth 4
```

### Test input

Save this as `deployment.yaml` in your repo:

```yaml
# web deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  labels:
    app: web
spec:
  replicas: 3
  template:
    spec:
      containers:
        - name: web
          image: nginx:latest
          env:
            - name: PORT
              value: "8080"
```

### Done when

`go run . deployment.yaml` prints counts you've verified by hand against the file. Commit it.

Notice, before you move on, how the code feels: a handful of loose counters per file, passed around or printed in place. Nothing holds them together. Sit with that mild discomfort — Module 2 is about exactly that problem, and your first job there will be fixing it here.

> **Where this ends up:** the finished tool is specced on the [Config Linter project page](project-config-linter.html) — CLI flags, six rules, exit codes. Skim it for motivation if you like, but none of it is your job yet.
