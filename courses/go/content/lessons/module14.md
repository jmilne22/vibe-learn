## Goroutines: Lightweight Threads

A goroutine is like a lightweight thread. Spawning millions is fine.

*Basic goroutine*

```go
func main() {
    // Start a goroutine with 'go'
    go func() {
        fmt.Println("Hello from goroutine!")
    }()
    
    // Or call a named function
    go doWork("task1")
    go doWork("task2")
    
    // Main must wait, or it exits and kills goroutines
    time.Sleep(100 * time.Millisecond)
}

func doWork(name string) {
    fmt.Printf("Starting %s\n", name)
    time.Sleep(50 * time.Millisecond)
    fmt.Printf("Finished %s\n", name)
}
```

> **Don't use time.Sleep!:** Use proper synchronization (channels, WaitGroup). Sleep is just for demos.

## Channels: Goroutine Communication

// Channel is a pipe between goroutines

Goroutine A  ──[value]──>  Channel  ──[value]──>  Goroutine B

*Basic channels*

```go
// Create a channel
ch := make(chan string)

// Send to channel (blocks until received)
go func() {
    ch <- "hello"  // Send
}()

// Receive from channel (blocks until sent)
msg := <-ch  // Receive
fmt.Println(msg)

// Buffered channel (non-blocking until full)
buffered := make(chan int, 3)  // Buffer size 3
buffered <- 1
buffered <- 2
buffered <- 3
// buffered <- 4  // Would block!
```

## WaitGroup: Waiting for Goroutines

*sync.WaitGroup*

```go
import "sync"

func main() {
    var wg sync.WaitGroup
    
    urls := []string{
        "https://google.com",
        "https://github.com",
        "https://golang.org",
    }
    
    for _, url := range urls {
        wg.Add(1)  // Increment counter
        go func(u string) {
            defer wg.Done()  // Decrement when done
            fetch(u)
        }(url)
    }
    
    wg.Wait()  // Block until counter is 0
    fmt.Println("All done!")
}
```

## Select: Multiplexing Channels

*Select statement*

```go
func main() {
    ch1 := make(chan string)
    ch2 := make(chan string)
    
    go func() {
        time.Sleep(100 * time.Millisecond)
        ch1 <- "from ch1"
    }()
    
    go func() {
        time.Sleep(200 * time.Millisecond)
        ch2 <- "from ch2"
    }()
    
    // Select waits on multiple channels
    for i := 0; i < 2; i++ {
        select {
        case msg := <-ch1:
            fmt.Println(msg)
        case msg := <-ch2:
            fmt.Println(msg)
        }
    }
}

// Select with timeout
select {
case result := <-ch:
    fmt.Println(result)
case <-time.After(5 * time.Second):
    fmt.Println("Timeout!")
}
```

## Context: Cancellation & Timeouts

*Context usage*

```go
import "context"

// With timeout
ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
defer cancel()

// Pass context to functions
result, err := fetchWithContext(ctx, "https://api.example.com")

func fetchWithContext(ctx context.Context, url string) ([]byte, error) {
    req, _ := http.NewRequestWithContext(ctx, "GET", url, nil)
    
    resp, err := http.DefaultClient.Do(req)
    if err != nil {
        return nil, err
    }
    defer resp.Body.Close()
    
    return io.ReadAll(resp.Body)
}

// Check if cancelled in long-running work
func doWork(ctx context.Context) error {
    for {
        select {
        case <-ctx.Done():
            return ctx.Err()  // Cancelled or deadline exceeded
        default:
            // Do work...
        }
    }
}
```

## Worker Pool Pattern

*Worker pool*

```go
func worker(id int, jobs <-chan int, results chan<- int) {
    for job := range jobs {
        fmt.Printf("Worker %d processing job %d\n", id, job)
        time.Sleep(100 * time.Millisecond)  // Simulate work
        results <- job * 2
    }
}

func main() {
    numJobs := 10
    numWorkers := 3
    
    jobs := make(chan int, numJobs)
    results := make(chan int, numJobs)
    
    // Start workers
    for w := 1; w <= numWorkers; w++ {
        go worker(w, jobs, results)
    }
    
    // Send jobs
    for j := 1; j <= numJobs; j++ {
        jobs <- j
    }
    close(jobs)
    
    // Collect results
    for r := 1; r <= numJobs; r++ {
        <-results
    }
}
```

### 🔨 Project: Parallel Downloader

Put your skills to work! Build a concurrent file downloader with worker pools and progress tracking.

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

## Module 12 Summary

- **go func()** — spawn goroutine
- **chan T** — create channel
- **ch <- / <-ch** — send / receive
- **sync.WaitGroup** — wait for goroutines
- **select** — multiplex channels
- **context** — cancellation and timeouts
- **Worker pool** — bounded parallelism

> **The Go Proverb:** "Don't communicate by sharing memory; share memory by communicating." -- Use channels, not mutexes.
