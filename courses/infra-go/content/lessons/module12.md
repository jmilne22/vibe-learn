You need to pass coding interviews. This module gives you the patterns, not just the answers. Every problem is infra-themed so you're building two skills at once.

---

## Hash Maps: The Universal Solver

Maps solve a huge class of problems by giving you O(1) lookup.

### Two Sum Pattern

The classic: find two numbers that add to a target. Brute force is O(n²). A map makes it O(n):

```go
// Find two server latencies that sum to a target SLA budget
func twoSum(latencies []int, target int) (int, int) {
    seen := make(map[int]int) // value → index
    for i, lat := range latencies {
        complement := target - lat
        if j, ok := seen[complement]; ok {
            return j, i
        }
        seen[lat] = i
    }
    return -1, -1
}
```

**The insight:** For each element, ask "have I already seen its complement?" Instead of searching the whole array, check the map.

### Frequency Counting

```go
// Count pod statuses across a cluster
func countStatuses(pods []string) map[string]int {
    counts := make(map[string]int)
    for _, status := range pods {
        counts[status]++
    }
    return counts
}
// Input: ["Running", "Running", "Pending", "Failed", "Running"]
// Output: map[Running:3 Pending:1 Failed:1]
```

### Grouping

```go
// Group pods by namespace
func groupByNamespace(pods []Pod) map[string][]Pod {
    groups := make(map[string][]Pod)
    for _, pod := range pods {
        groups[pod.Namespace] = append(groups[pod.Namespace], pod)
    }
    return groups
}
```

### Deduplication

```go
// Deduplicate alert names while preserving order
func dedup(alerts []string) []string {
    seen := make(map[string]bool)
    var result []string
    for _, alert := range alerts {
        if !seen[alert] {
            seen[alert] = true
            result = append(result, alert)
        }
    }
    return result
}
```

**When to reach for a map:** "Have I seen this before?", "How many of each?", "Group by X", "Find pairs".

## Two Pointers

Two pointers work on sorted data or when you need to compare elements from different positions.

### Merging Sorted Lists

Merging sorted log files — classic interview question:

```go
// Merge two sorted slices of timestamps
func mergeSorted(a, b []int) []int {
    result := make([]int, 0, len(a)+len(b))
    i, j := 0, 0
    for i < len(a) && j < len(b) {
        if a[i] <= b[j] {
            result = append(result, a[i])
            i++
        } else {
            result = append(result, b[j])
            j++
        }
    }
    result = append(result, a[i:]...)
    result = append(result, b[j:]...)
    return result
}
```

O(n+m) time, single pass through both lists.

### Removing Duplicates In Place

```go
// Remove duplicate consecutive entries from sorted slice
func removeDuplicates(nums []int) int {
    if len(nums) == 0 {
        return 0
    }
    slow := 0
    for fast := 1; fast < len(nums); fast++ {
        if nums[fast] != nums[slow] {
            slow++
            nums[slow] = nums[fast]
        }
    }
    return slow + 1 // new length
}
```

The slow pointer marks where to write. The fast pointer scans ahead. O(n) time, O(1) extra space.

### Finding Pairs in Sorted Data

```go
// Find two server capacities that sum to target (sorted input)
func twoSumSorted(capacities []int, target int) (int, int) {
    left, right := 0, len(capacities)-1
    for left < right {
        sum := capacities[left] + capacities[right]
        if sum == target {
            return left, right
        } else if sum < target {
            left++ // need a bigger number
        } else {
            right-- // need a smaller number
        }
    }
    return -1, -1
}
```

O(n) instead of O(n²). Only works on sorted data.

## Sliding Window

Sliding windows process subarrays or substrings efficiently.

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

## Binary Search

Binary search finds a value (or a boundary) in O(log n).

### Classic Binary Search

```go
// Find a config version in a sorted version list
func findVersion(versions []string, target string) int {
    lo, hi := 0, len(versions)-1
    for lo <= hi {
        mid := lo + (hi-lo)/2 // avoid overflow vs (lo+hi)/2
        if versions[mid] == target {
            return mid
        } else if versions[mid] < target {
            lo = mid + 1
        } else {
            hi = mid - 1
        }
    }
    return -1 // not found
}
```

### Go's sort.Search

```go
import "sort"

// Find the first version >= "v1.5.0"
versions := []string{"v1.2.0", "v1.3.0", "v1.5.0", "v1.6.0", "v2.0.0"}
i := sort.SearchStrings(versions, "v1.5.0")
// i == 2

// Generic: find first index where f(i) is true
i = sort.Search(len(versions), func(i int) bool {
    return versions[i] >= "v1.5.0"
})
```

### Binary Search on the Answer

"What's the minimum number of servers to handle N requests, given each server handles at most M?"

```go
// Binary search on answer: minimum servers needed
func minServers(requests int, perServer int) int {
    lo, hi := 1, requests
    for lo < hi {
        mid := lo + (hi-lo)/2
        if mid*perServer >= requests {
            hi = mid // might be enough
        } else {
            lo = mid + 1 // not enough
        }
    }
    return lo
}
```

**The pattern:** When the answer is monotonic (if X servers work, X+1 also works), binary search the answer space.

## Stack Patterns

Stacks solve problems with matching, nesting, and ordering.

### Matching Brackets

```go
// Validate config syntax: matching brackets
func isValid(s string) bool {
    stack := []byte{}
    pairs := map[byte]byte{')': '(', ']': '[', '}': '{'}
    for i := 0; i < len(s); i++ {
        ch := s[i]
        if ch == '(' || ch == '[' || ch == '{' {
            stack = append(stack, ch)
        } else if match, ok := pairs[ch]; ok {
            if len(stack) == 0 || stack[len(stack)-1] != match {
                return false
            }
            stack = stack[:len(stack)-1] // pop
        }
    }
    return len(stack) == 0
}
```

### Monotonic Stack: Next Greater Element

```go
// For each server load, find the next time a higher load occurs
func nextGreaterElement(loads []int) []int {
    result := make([]int, len(loads))
    for i := range result {
        result[i] = -1 // default: no greater element
    }
    stack := []int{} // indices
    for i, load := range loads {
        for len(stack) > 0 && loads[stack[len(stack)-1]] < load {
            top := stack[len(stack)-1]
            stack = stack[:len(stack)-1]
            result[top] = load
        }
        stack = append(stack, i)
    }
    return result
}
// Input:  [3, 1, 4, 1, 5, 9]
// Output: [4, 4, 5, 5, 9, -1]
```

O(n) — each element is pushed and popped at most once.

## Practice Strategy

### How to Learn Patterns

1. **Recognize the pattern** — Read the problem, identify which pattern applies
2. **Write the skeleton** — Set up the data structure (map, two pointers, window)
3. **Fill in the logic** — The invariant that defines your solution
4. **Verify with examples** — Walk through with small inputs

### Pattern Recognition Cheat Sheet

| Signal in Problem | Try This Pattern |
|---|---|
| "Find pair that sums to X" | Hash map or two pointers (if sorted) |
| "Count occurrences" | Hash map frequency counting |
| "Longest subarray with condition" | Sliding window |
| "Find in sorted data" | Binary search |
| "Matching/nesting" | Stack |
| "Minimum needed to satisfy" | Binary search on answer |
| "Merge sorted inputs" | Two pointers |
| "Next greater/smaller element" | Monotonic stack |

### Interview Mindset

1. **State the pattern** before coding: "This is a sliding window problem because..."
2. **Start with brute force**, then optimize: "Brute force is O(n²), but with a map we get O(n)"
3. **Think out loud** — interviewers care about your reasoning, not just the answer
4. **Test edge cases:** empty input, single element, all same values

---

## Exercises

Practice individual concepts with quick drills, then tackle multi-step challenges.

<div id="warmups-container">
    <noscript><p class="js-required">JavaScript is required for the interactive exercises.</p></noscript>
</div>

### Challenges

Apply what you learned to infra-themed problems. Each challenge has multiple variants — shuffle to keep things fresh.

<div id="challenges-container">
    <noscript><p class="js-required">JavaScript is required for the interactive exercises.</p></noscript>
</div>
