## Project Goals

Build a simple task runner that:

1. Reads `tasks.yaml` from current directory
2. Lists available tasks with `mytask list`
3. Runs a task with `mytask run build`
4. Handles task dependencies (run deps first)
5. Shows real-time output while running

## Starter Code

*runTask function*

```go
func runTask(config *Config, taskName string, ran map[string]bool) error {
    if ran[taskName] {
        return nil  // Already ran
    }
    
    task, ok := config.Tasks[taskName]
    if !ok {
        return fmt.Errorf("unknown task: %s", taskName)
    }
    
    // Run dependencies first
    for _, dep := range task.DependsOn {
        if err := runTask(config, dep, ran); err != nil {
            return err
        }
    }
    
    fmt.Printf("▶ Running: %s\n", taskName)
    cmd := exec.Command("bash", "-c", task.Command)
    cmd.Stdout = os.Stdout
    cmd.Stderr = os.Stderr
    
    if err := cmd.Run(); err != nil {
        return fmt.Errorf("task %s failed: %w", taskName, err)
    }
    
    ran[taskName] = true
    return nil
}
```

## Example tasks.yaml

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
    depends_on:
      - build
  
  clean:
    command: rm -f app
    description: Clean build artifacts
```

> **Skills Used:** <p>YAML parsing, file I/O, exec.Command, dependency graphs, CLI design.</p>
