## Worker Pools

A fixed number of goroutines processing jobs from a shared queue:

```go
func workerPool(jobs <-chan Job, results chan<- Result, numWorkers int) {
    var wg sync.WaitGroup
    for i := 0; i < numWorkers; i++ {
        wg.Add(1)
        go func(id int) {
            defer wg.Done()
            for job := range jobs {
                results <- processJob(id, job)
            }
        }(i)
    }
    wg.Wait()
    close(results)
}

// Usage
jobs := make(chan Job, 100)
results := make(chan Result, 100)

go workerPool(jobs, results, 5) // 5 workers

// Send jobs
for _, j := range allJobs {
    jobs <- j
}
close(jobs)

// Collect results
for r := range results {
    fmt.Println(r)
}
```

**Why not one goroutine per job?** If you have 10,000 HTTP requests, launching 10,000 goroutines will overwhelm the target server. A pool of 20 workers is controlled and predictable.

<div class="inline-exercises" data-concept="Worker Pools"></div>
