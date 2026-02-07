## Big O Notation

Before diving into patterns, you need to talk about how fast things are. Big O describes how runtime or memory grows as input grows.

*Common complexities*

```go
// O(1) — Constant: doesn't depend on input size
func getFirst(nums []int) int {
    return nums[0]
}

// O(log n) — Logarithmic: halves the problem each step
func binarySearch(sorted []int, target int) int {
    lo, hi := 0, len(sorted)-1
    for lo <= hi {
        mid := lo + (hi-lo)/2
        if sorted[mid] == target {
            return mid
        } else if sorted[mid] < target {
            lo = mid + 1
        } else {
            hi = mid - 1
        }
    }
    return -1
}

// O(n) — Linear: visits each element once
func sum(nums []int) int {
    total := 0
    for _, n := range nums {
        total += n
    }
    return total
}

// O(n log n) — Linearithmic: typical for good sorting
// sort.Ints uses this internally

// O(n²) — Quadratic: nested loops over the same data
func hasDuplicate(nums []int) bool {
    for i := 0; i < len(nums); i++ {
        for j := i + 1; j < len(nums); j++ {
            if nums[i] == nums[j] {
                return true
            }
        }
    }
    return false
}
```

*Space complexity*

```go
// O(1) space — modifies in place
func reverseInPlace(nums []int) {
    for i, j := 0, len(nums)-1; i < j; i, j = i+1, j-1 {
        nums[i], nums[j] = nums[j], nums[i]
    }
}

// O(n) space — creates a new structure proportional to input
func frequencies(nums []int) map[int]int {
    freq := make(map[int]int)
    for _, n := range nums {
        freq[n]++
    }
    return freq
}
```

> **The key insight:** Big O isn't about exact speed — it's about *scaling*. An O(n) solution that processes 1 million items in 10ms would take 10 seconds at O(n²). That's the difference between usable and broken.

## Hash Maps

The most common pattern in algorithm problems. Use a map to turn O(n²) lookups into O(n).

*Pattern: frequency counting*

```go
// Count occurrences of each element
func topKFrequent(nums []int, k int) []int {
    freq := make(map[int]int)
    for _, n := range nums {
        freq[n]++
    }

    // Bucket sort by frequency
    buckets := make([][]int, len(nums)+1)
    for num, count := range freq {
        buckets[count] = append(buckets[count], num)
    }

    var result []int
    for i := len(buckets) - 1; i >= 0 && len(result) < k; i-- {
        result = append(result, buckets[i]...)
    }
    return result[:k]
}
```

*Pattern: complement lookup*

```go
// Find two numbers that sum to target — O(n) instead of O(n²)
func twoSum(nums []int, target int) (int, int) {
    seen := make(map[int]int) // value -> index
    for i, n := range nums {
        complement := target - n
        if j, ok := seen[complement]; ok {
            return j, i
        }
        seen[n] = i
    }
    return -1, -1
}
```

> **When to use:** Whenever you need fast lookups, counting, or duplicate detection. Maps give O(1) average lookup vs O(n) for slice scanning.

## Two Pointers

Use two indices moving through a sorted array or from both ends. Eliminates nested loops.

*Pattern: opposite ends*

```go
// Check if a string is a palindrome
func isPalindrome(s string) bool {
    runes := []rune(s)
    left, right := 0, len(runes)-1
    for left < right {
        if runes[left] != runes[right] {
            return false
        }
        left++
        right--
    }
    return true
}
```

*Pattern: sorted pair search*

```go
// Find pair summing to target in a SORTED array — O(n) time, O(1) space
func twoSumSorted(nums []int, target int) (int, int) {
    left, right := 0, len(nums)-1
    for left < right {
        sum := nums[left] + nums[right]
        if sum == target {
            return left, right
        } else if sum < target {
            left++
        } else {
            right--
        }
    }
    return -1, -1
}
```

> **When to use:** Sorted data, palindrome checks, comparing elements from both ends, removing duplicates in-place. The key signal is "sorted array" or "compare from edges".

## Sliding Window

Maintain a window (subarray/substring) that slides across the data. Avoids recomputing from scratch.

*Pattern: fixed-size window*

```go
// Maximum sum of k consecutive elements
func maxSumWindow(nums []int, k int) int {
    if len(nums) < k {
        return 0
    }

    // Compute initial window sum
    windowSum := 0
    for i := 0; i < k; i++ {
        windowSum += nums[i]
    }

    maxSum := windowSum
    // Slide: add right, remove left
    for i := k; i < len(nums); i++ {
        windowSum += nums[i] - nums[i-k]
        if windowSum > maxSum {
            maxSum = windowSum
        }
    }
    return maxSum
}
```

*Pattern: variable-size window*

```go
// Longest substring without repeating characters
func lengthOfLongestSubstring(s string) int {
    seen := make(map[byte]int)
    maxLen := 0
    left := 0

    for right := 0; right < len(s); right++ {
        if idx, ok := seen[s[right]]; ok && idx >= left {
            left = idx + 1
        }
        seen[s[right]] = right
        if right-left+1 > maxLen {
            maxLen = right - left + 1
        }
    }
    return maxLen
}
```

> **When to use:** Subarray/substring problems asking for "longest", "shortest", "maximum sum". The signal is a contiguous sequence with a constraint.

## Stacks

Last-in, first-out. In Go, a slice is your stack.

*Pattern: matching pairs*

```go
// Validate balanced parentheses
func isValid(s string) bool {
    stack := []rune{}
    pairs := map[rune]rune{')': '(', ']': '[', '}': '{'}

    for _, ch := range s {
        if ch == '(' || ch == '[' || ch == '{' {
            stack = append(stack, ch)
        } else {
            if len(stack) == 0 || stack[len(stack)-1] != pairs[ch] {
                return false
            }
            stack = stack[:len(stack)-1] // pop
        }
    }
    return len(stack) == 0
}
```

*Stack operations in Go*

```go
// Push
stack = append(stack, value)

// Peek (top element)
top := stack[len(stack)-1]

// Pop
top := stack[len(stack)-1]
stack = stack[:len(stack)-1]

// IsEmpty
empty := len(stack) == 0
```

> **When to use:** Matching brackets, undo operations, expression evaluation, monotonic sequences. The signal is "most recent" or "nesting".

## Binary Search

Repeatedly halve the search space. Only works on sorted data.

*Pattern: standard binary search*

```go
func binarySearch(nums []int, target int) int {
    lo, hi := 0, len(nums)-1
    for lo <= hi {
        mid := lo + (hi-lo)/2 // avoids overflow vs (lo+hi)/2
        if nums[mid] == target {
            return mid
        } else if nums[mid] < target {
            lo = mid + 1
        } else {
            hi = mid - 1
        }
    }
    return -1
}
```

*Pattern: search for insertion point*

```go
// Find leftmost position where target could be inserted
func searchInsert(nums []int, target int) int {
    lo, hi := 0, len(nums)
    for lo < hi {
        mid := lo + (hi-lo)/2
        if nums[mid] < target {
            lo = mid + 1
        } else {
            hi = mid
        }
    }
    return lo
}
```

> **When to use:** Sorted arrays, finding boundaries, minimizing/maximizing a value where you can binary search the answer space. Go's `sort.Search` implements this pattern.

## Linked Lists

Pointer manipulation. Go doesn't have a built-in singly-linked list for algorithms — you define the node.

*Node definition*

```go
type ListNode struct {
    Val  int
    Next *ListNode
}
```

*Pattern: reverse a linked list*

```go
func reverseList(head *ListNode) *ListNode {
    var prev *ListNode
    curr := head
    for curr != nil {
        next := curr.Next  // save next
        curr.Next = prev   // reverse pointer
        prev = curr        // advance prev
        curr = next        // advance curr
    }
    return prev
}
```

*Pattern: fast/slow pointers (cycle detection)*

```go
func hasCycle(head *ListNode) bool {
    slow, fast := head, head
    for fast != nil && fast.Next != nil {
        slow = slow.Next
        fast = fast.Next.Next
        if slow == fast {
            return true
        }
    }
    return false
}
```

> **When to use:** Reversals, cycle detection, finding middle element, merging sorted lists. The fast/slow pointer trick shows up constantly.

## Choosing the Right Pattern

| Problem Signal | Pattern | Example |
|---|---|---|
| "Find pair/complement" | Hash Map | Two Sum |
| "Count occurrences" | Hash Map | Frequency count |
| "Sorted array + pair" | Two Pointers | Two Sum II |
| "Palindrome" | Two Pointers | Valid Palindrome |
| "Longest/shortest subarray" | Sliding Window | Max subarray sum |
| "Matching/nesting" | Stack | Valid Parentheses |
| "Sorted + find element" | Binary Search | Search Insert Position |
| "Reverse/cycle in list" | Linked List pointers | Reverse Linked List |

## Algorithm Practice Arena

The exercises below teach you the building blocks — implementing the data structures and mechanics themselves. Once you're comfortable with them, head to the **[Algorithm Practice](/algorithms.html)** arena to apply these patterns to real problems like Two Sum, Valid Parentheses, and more.

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

## Module 20 Summary

- **Big O notation** — how runtime/space scales with input size
- **Hash Maps** — O(1) lookups for counting, complements, deduplication
- **Two Pointers** — opposite ends or same direction on sorted data
- **Sliding Window** — fixed or variable windows over contiguous sequences
- **Stacks** — LIFO for matching, nesting, undo operations
- **Binary Search** — halving sorted search space in O(log n)
- **Linked Lists** — pointer manipulation, reversal, cycle detection
