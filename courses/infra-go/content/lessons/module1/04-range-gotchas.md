## Range Gotchas

Now that slice basics and in-place writes are on the table, this section covers the two `range` behaviors that cause quiet bugs.

### Range Values Are Copies

The value variable in `for _, v := range nums` is a copy of the element. Changing `v` changes only the copy.

<predict prompt="What does this print?">
```go
nums := []int{1, 2, 3}
for _, v := range nums {
    v = v * 10
}
fmt.Println(nums)
```
```
[1 2 3]
```
</predict>

If you need to modify the slice, range over indexes and write through the slice:

```go
nums := []int{1, 2, 3}
for i := range nums {
    nums[i] = nums[i] * 10
}
fmt.Println(nums) // [10 20 30]
```

Read with `for _, v := range nums`. Mutate with `for i := range nums`.

### Range Locks the Length

When a `range` loop starts, Go decides how many iterations it will run. If you append during the loop, the new elements are added to the slice, but this loop will not visit them.

<predict prompt="How many iterations does this loop run, and what does the slice look like at the end?">
```go
nums := []int{1, 2, 3}
iters := 0
for i := range nums {
    iters++
    if nums[i] == 2 {
        nums = append(nums, 99)
    }
}
fmt.Println(iters, nums)
```
```
3 [1 2 3 99]
```
</predict>

The append worked. The loop still ran only three times because `range` locked the original length.

### The Habit

```go
// Reading elements
for _, v := range items {
    fmt.Println(v)
}

// Mutating elements
for i := range items {
    items[i] = strings.TrimSpace(items[i])
}

// Growing a slice from another slice
var out []string
for _, item := range items {
    out = append(out, item)
}
```

The last pattern appends to a different slice, not the slice being ranged over. That is the normal safe shape.

<div class="inline-exercises" data-concept="Range Gotchas"></div>

---
