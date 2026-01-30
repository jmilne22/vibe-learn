## Checking If Things Exist

### Files and Directories

*File existence*

```go
import (
    "errors"
    "os"
)

// Check if path exists (file or directory)
func exists(path string) bool {
    _, err := os.Stat(path)
    return err == nil
}

// Check specifically for file vs directory
func isFile(path string) bool {
    info, err := os.Stat(path)
    if err != nil {
        return false
    }
    return !info.IsDir()
}

// Check specifically for "doesn't exist" vs other errors
func existsStrict(path string) (bool, error) {
    _, err := os.Stat(path)
    if err == nil {
        return true, nil
    }
    if errors.Is(err, os.ErrNotExist) {
        return false, nil
    }
    return false, err  // Some other error (permissions, etc)
}
```

### Commands in PATH

*Command existence*

```bash
import "os/exec"

// Check if a command is available
func commandExists(name string) bool {
    _, err := exec.LookPath(name)
    return err == nil
}

// Get full path to command
func whichCommand(name string) (string, error) {
    return exec.LookPath(name)
}

// Usage
if commandExists("git") {
    fmt.Println("Git is installed")
}

path, err := whichCommand("python3")
// path = "/usr/bin/python3"
```

## Running Commands

The `os/exec` package is your friend here.

### Capture Output

*Getting command output*

```bash
import (
    "os/exec"
    "strings"
)

// Simple: run and get stdout
out, err := exec.Command("whoami").Output()
if err != nil {
    panic(err)
}
username := strings.TrimSpace(string(out))

// With arguments
out, err = exec.Command("ls", "-la", "/tmp").Output()

// Get output as lines
func runLines(name string, args ...string) ([]string, error) {
    out, err := exec.Command(name, args...).Output()
    if err != nil {
        return nil, err
    }
    text := strings.TrimSpace(string(out))
    if text == "" {
        return []string{}, nil
    }
    return strings.Split(text, "\n"), nil
}
```

### Capture stdout AND stderr

*Both streams*

```go
import "bytes"

func runFull(name string, args ...string) (stdout, stderr string, err error) {
    cmd := exec.Command(name, args...)
    
    var outBuf, errBuf bytes.Buffer
    cmd.Stdout = &outBuf
    cmd.Stderr = &errBuf
    
    err = cmd.Run()
    return outBuf.String(), errBuf.String(), err
}

// CombinedOutput merges stdout and stderr
out, err := exec.Command("make").CombinedOutput()
```

### Stream to Terminal (Interactive)

*Interactive commands*

```bash
import "os"

// Connect command to our terminal
cmd := exec.Command("vim", "file.txt")
cmd.Stdin = os.Stdin
cmd.Stdout = os.Stdout
cmd.Stderr = os.Stderr
err := cmd.Run()

// For commands that need user input (like sudo password)
cmd := exec.Command("sudo", "apt", "update")
cmd.Stdin = os.Stdin
cmd.Stdout = os.Stdout
cmd.Stderr = os.Stderr
cmd.Run()
```

## Working Directory & Environment

*Command context*

```bash
// Run command in specific directory
cmd := exec.Command("git", "status")
cmd.Dir = "/path/to/repo"
out, err := cmd.Output()

// Set environment variables
cmd := exec.Command("./script.sh")
cmd.Env = append(os.Environ(), "MY_VAR=value")

// Or replace entire environment
cmd.Env = []string{
    "PATH=/usr/bin",
    "HOME=/home/user",
}
```

## Exit Codes

*Handling exit codes*

```go
import "os/exec"

cmd := exec.Command("grep", "pattern", "file.txt")
err := cmd.Run()

if err != nil {
    // Try to get exit code
    if exitErr, ok := err.(*exec.ExitError); ok {
        code := exitErr.ExitCode()
        fmt.Printf("Command exited with code %d\n", code)
        
        // For grep: 0 = found, 1 = not found, 2 = error
        if code == 1 {
            fmt.Println("Pattern not found")
        }
    } else {
        // Some other error (command not found, etc)
        fmt.Println("Failed to run:", err)
    }
}
```

## Parsing Key-Value Files

Many config files on Linux use simple `KEY=value` format.

*Parsing KEY=value files*

```go
import (
    "bufio"
    "os"
    "strings"
)

func parseKeyValueFile(path string) (map[string]string, error) {
    file, err := os.Open(path)
    if err != nil {
        return nil, err
    }
    defer file.Close()
    
    result := make(map[string]string)
    scanner := bufio.NewScanner(file)
    
    for scanner.Scan() {
        line := strings.TrimSpace(scanner.Text())
        
        // Skip empty lines and comments
        if line == "" || strings.HasPrefix(line, "#") {
            continue
        }
        
        // Split on first = only
        parts := strings.SplitN(line, "=", 2)
        if len(parts) == 2 {
            key := parts[0]
            value := strings.Trim(parts[1], "\"'")  // Remove quotes
            result[key] = value
        }
    }
    
    return result, scanner.Err()
}
```

## Parsing Command Output

Every command has different output. Learn to parse them.

*Common parsing patterns*

```go
// Simple: one item per line
lines, _ := runLines("ls")
for _, line := range lines {
    fmt.Println(line)
}

// Columns: split by whitespace
lines, _ := runLines("ps", "aux")
for _, line := range lines[1:] {  // Skip header
    fields := strings.Fields(line)
    if len(fields) >= 11 {
        user := fields[0]
        pid := fields[1]
        command := fields[10]
        fmt.Printf("%s %s %s\n", user, pid, command)
    }
}

// Delimiter: split by specific char
// /etc/passwd format: name:x:uid:gid:info:home:shell
lines, _ := runLines("cat", "/etc/passwd")
for _, line := range lines {
    parts := strings.Split(line, ":")
    if len(parts) >= 7 {
        username := parts[0]
        shell := parts[6]
        fmt.Printf("%s uses %s\n", username, shell)
    }
}

// Extracting part of a string
// Version strings like "git version 2.34.1"
out, _ := exec.Command("git", "--version").Output()
version := strings.TrimPrefix(string(out), "git version ")
version = strings.TrimSpace(version)
```

## Checking Permissions

*User and permissions*

```go
import "os"

// Am I root?
func isRoot() bool {
    return os.Geteuid() == 0
}

// Get current user
import "os/user"

u, err := user.Current()
if err == nil {
    fmt.Println(u.Username)  // "alice"
    fmt.Println(u.HomeDir)   // "/home/alice"
}

// Check if file is readable/writable
info, err := os.Stat("/etc/shadow")
if err == nil {
    mode := info.Mode()
    fmt.Printf("Permissions: %s\n", mode.Perm())
}
```

## Exercises

Progress through each section in order, or jump to where you need practice.

Practice individual concepts you just learned.

<div id="warmups-container">
            <noscript><p class="js-required">JavaScript is required for the interactive exercises.</p></noscript>
            </div>

### 💪 Challenges

Combine concepts and learn patterns. Each challenge has multiple variants at different difficulties.

<div id="challenges-container">
            <noscript><p class="js-required">JavaScript is required for the interactive exercises.</p></noscript>
            </div>

## Module 14 Summary

- **os.Stat()** — check if files/dirs exist
- **exec.LookPath()** — check if command exists in PATH
- **exec.Command().Output()** — run and capture stdout
- **cmd.Stdin/Stdout/Stderr = os.Std*** — interactive commands
- **ExitError.ExitCode()** — get exit status
- **strings.Fields()** — split by whitespace
- **strings.SplitN(s, "=", 2)** — split on first occurrence only
