## Project 3: Mini Shell

### What You'll Build

A minimal Unix shell that parses commands, handles built-ins (cd, exit), and executes external programs using fork/exec. A classic Stanford/CMU systems programming assignment.

### Concepts Applied

- String tokenization and command parsing
- Multi-file project organization
- Makefile-based builds
- Process creation with fork() and exec()
- Pipeline support with pipes
- Signal handling (Ctrl+C)
- Debugging with GDB and sanitizers

### Example

```
$ ./minish
minish> echo hello world
hello world
minish> ls -la | grep .c
-rw-r--r-- 1 user user  1234 Jan 15 10:00 main.c
-rw-r--r-- 1 user user  2345 Jan 15 10:00 parser.c
minish> cd /tmp
minish> pwd
/tmp
minish> exit
```

---

*Content coming soon.* This project will guide you through building a working shell, applying multi-file project organization, Makefiles, and systems programming concepts. It is the most integration-heavy project in the course.
