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

<div class="inline-exercises" data-concept="Two Pointers"></div>
