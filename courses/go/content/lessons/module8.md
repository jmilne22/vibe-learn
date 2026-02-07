## Reading & Writing Files

*File operations*

```go
package main

import (
    "os"
)

func main() {
    // Read entire file (simple)
    data, err := os.ReadFile("config.yaml")
    if err != nil {
        panic(err)
    }
    
    // Write entire file
    err = os.WriteFile("output.txt", []byte("Hello!"), 0644)
    
    // Check if file exists
    if _, err := os.Stat("file.txt"); os.IsNotExist(err) {
        fmt.Println("File doesn't exist")
    }
    
    // Create directory
    os.MkdirAll("path/to/dir", 0755)
    
    // List directory
    entries, _ := os.ReadDir(".")
    for _, e := range entries {
        fmt.Println(e.Name(), e.IsDir())
    }
}
```

## Parsing YAML

*Install yaml package*

```bash
$ go get gopkg.in/yaml.v3
```

*tasks.yaml*

```yaml
name: my-project
version: "1.0"

tasks:
  build:
    command: go build -o app .
    description: Build the application
  
  test:
    command: go test ./...
    description: Run tests
  
  deploy:
    command: ./deploy.sh
    depends_on:
      - build
      - test
```

*Parsing YAML*

```go
package main

import (
    "fmt"
    "os"
    "gopkg.in/yaml.v3"
)

type Config struct {
    Name    string          `yaml:"name"`
    Version string          `yaml:"version"`
    Tasks   map[string]Task `yaml:"tasks"`
}

type Task struct {
    Command     string   `yaml:"command"`
    Description string   `yaml:"description"`
    DependsOn   []string `yaml:"depends_on"`
}

func main() {
    data, err := os.ReadFile("tasks.yaml")
    if err != nil {
        panic(err)
    }
    
    var config Config
    if err := yaml.Unmarshal(data, &config); err != nil {
        panic(err)
    }
    
    fmt.Printf("Project: %s v%s\n", config.Name, config.Version)
    for name, task := range config.Tasks {
        fmt.Printf("  %s: %s\n", name, task.Description)
    }
}
```

## Running Shell Commands

*os/exec package*

```go
package main

import (
    "fmt"
    "os"
    "os/exec"
)

func main() {
    // Simple command with output
    out, err := exec.Command("ls", "-la").Output()
    if err != nil {
        fmt.Println("Error:", err)
    }
    fmt.Println(string(out))
    
    // Run through shell (for pipes, etc)
    cmd := exec.Command("bash", "-c", "echo hello | tr a-z A-Z")
    out, _ = cmd.Output()
    fmt.Println(string(out))  // HELLO
    
    // Stream output in real-time
    cmd = exec.Command("go", "build", "-v", ".")
    cmd.Stdout = os.Stdout  // Connect to our stdout
    cmd.Stderr = os.Stderr
    err = cmd.Run()
    
    // Get exit code
    if exitErr, ok := err.(*exec.ExitError); ok {
        fmt.Println("Exit code:", exitErr.ExitCode())
    }
}
```

> **Security:** Never pass user input directly to shell commands. Use exec.Command with separate args, not bash -c with string interpolation.

## Environment Variables

*Working with env vars*

```go
import "os"

// Get env var (empty string if not set)
home := os.Getenv("HOME")

// Get with default
port := os.Getenv("PORT")
if port == "" {
    port = "8080"
}

// Check if set
val, exists := os.LookupEnv("API_KEY")
if !exists {
    panic("API_KEY not set")
}

// Set env var
os.Setenv("MY_VAR", "value")

// Pass env to subprocess
cmd := exec.Command("./script.sh")
cmd.Env = append(os.Environ(), "CUSTOM=value")
```

### 🔨 Project: Task Runner

Put your skills to work! Build a task runner that reads YAML configs and executes shell commands.

Start Project →

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

## Module 7 Summary

- **os.ReadFile / WriteFile** — simple file I/O
- **yaml.Unmarshal** — parse YAML into structs
- **exec.Command** — run external commands
- **cmd.Stdout = os.Stdout** — stream output
- **os.Getenv / LookupEnv** — environment variables
