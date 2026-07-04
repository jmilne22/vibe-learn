## Sliding Window

Sliding windows process subarrays or substrings efficiently.

<attempt type="pretest">

<predict prompt="What does this print?">
```go
sum := 0
cpu := []int{3, 1, 4, 1, 5}
k := 3
for i := 0; i < k; i++ {
    sum += cpu[i]
}
fmt.Println(sum)
for i := k; i < len(cpu); i++ {
    sum += cpu[i] - cpu[i-k]
    fmt.Println(sum)
}
```
```
8
6
10
```
</predict>

Wrong is fine — the fixed-window section below derives exactly this add-one-drop-one trick.

</attempt>

### Fixed Window: Moving Average

```go
// Average CPU utilization over last k samples
func movingAverage(samples []float64, k int) []float64 {
    if len(samples) < k {
        return nil
    }
    // Compute initial window sum
    var windowSum float64
    for i := 0; i < k; i++ {
        windowSum += samples[i]
    }
    averages := []float64{windowSum / float64(k)}

    // Slide the window
    for i := k; i < len(samples); i++ {
        windowSum += samples[i] - samples[i-k] // add new, remove old
        averages = append(averages, windowSum/float64(k))
    }
    return averages
}
```

O(n) — each element is added and removed exactly once.

### Variable Window: Longest Streak

```go
// Longest streak of "healthy" status without any "error"
func longestHealthyStreak(statuses []string) int {
    maxLen := 0
    left := 0
    for right := 0; right < len(statuses); right++ {
        if statuses[right] == "error" {
            left = right + 1 // shrink: start fresh after error
        }
        if right-left+1 > maxLen {
            maxLen = right - left + 1
        }
    }
    return maxLen
}
```

### Variable Window: At Most K Errors

<attempt type="worked">

```go
// Longest subarray with at most k errors
func longestWithKErrors(statuses []string, k int) int {
    maxLen := 0
    errorCount := 0
    left := 0
    for right := 0; right < len(statuses); right++ {
        if statuses[right] == "error" {
            errorCount++
        }
        for errorCount > k {
            if statuses[left] == "error" {
                errorCount--
            }
            left++ // shrink until we have ≤ k errors
        }
        if right-left+1 > maxLen {
            maxLen = right - left + 1
        }
    }
    return maxLen
}
```

**The pattern:** Expand right to grow the window. If the window breaks a constraint, shrink from left until it's valid again.

</attempt>

<attempt type="gaps">

<gaps prompt="Longest run of deploys with at most k failed ones — grow the right edge every step; shrink the left edge only while over budget.">
```go
maxLen, failures, left := 0, 0, 0
for right := 0; right < len(deploys); right++ {
    if deploys[right] == "failed" {
        «failures++»
    }
    for «failures > k» {
        if deploys[left] == "failed" {
            failures--
        }
        «left++»
    }
    if right-left+1 > maxLen {
        maxLen = right - left + 1
    }
}
return maxLen
```
</gaps>

Two pointers, one invariant: between them the window never holds more failures than the budget allows.

</attempt>

<attempt type="scratch">

<div class="inline-exercises" data-concept="Sliding Window"></div>

</attempt>
