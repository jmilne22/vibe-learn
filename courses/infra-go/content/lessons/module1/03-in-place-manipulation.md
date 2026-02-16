## In-Place Manipulation

> *"Don't communicate by sharing memory, share memory by communicating."* — Go Proverb

Sometimes you can't afford a copy. Modify a slice without creating a new one.

### Swap Two Elements

Go's simultaneous assignment makes swapping trivial — no temp variable needed:

```go
colors := []string{"red", "green", "blue", "yellow"}
colors[0], colors[3] = colors[3], colors[0]
// Before: [red green blue yellow]
// After:  [yellow green blue red]
```

The general form is `s[i], s[j] = s[j], s[i]`. Both sides are evaluated before any assignment happens, so neither value is lost.

### Reverse In Place

Think about what reversing means: the first element swaps with the last, the second with the second-to-last, and so on. You need two positions — one starting at the front, one at the back — walking toward each other. When they meet in the middle, you're done.

```go
letters := []string{"a", "b", "c", "d", "e"}

left := 0
right := len(letters) - 1
for left < right {
    letters[left], letters[right] = letters[right], letters[left]
    left++
    right--
}
// Before: [a b c d e]
// After:  [e d c b a]
```

`left` starts at 0, `right` starts at the last index. Each step: swap them, move both inward. Stop when they've met or crossed.

Go also supports a compact multi-variable form that does the same thing:

```go
for i, j := 0, len(s)-1; i < j; i, j = i+1, j-1 {
    s[i], s[j] = s[j], s[i]
}
```

The simultaneous assignment `i, j = i+1, j-1` updates both in one statement. Use whichever form you find easier to read.

### Remove at Index (Preserving Order)

You want to remove an element and keep everything else in the same order. Think of it as: take everything before the index, then everything after, and join them.

```go
items := []string{"a", "b", "c", "d", "e"}
i := 2 // remove "c"
items = append(items[:i], items[i+1:]...)
// Before: [a b c d e]
// After:  [a b d e]
```

`items[:2]` is `["a", "b"]`. `items[3:]` is `["d", "e"]`. `append` joins them, shifting the later elements left to fill the gap. The `...` unpacks the second slice so append can accept it.

### Remove at Index (Fast, Order Doesn't Matter)

If you don't care about order, there's an O(1) trick: copy the last element into the gap, then shrink:

```go
items := []string{"a", "b", "c", "d", "e"}
i := 1 // remove "b"

// Overwrite the gap with the last element, then shrink
items[i] = items[len(items)-1]
items = items[:len(items)-1]

// Before: [a b c d e]
// After:  [a e c d]
```

Only two operations regardless of slice size. Use this when order doesn't matter — like removing a terminated pod from a running list.

### Filter In Place

Say you have 10,000 items and need to keep only the ones that match a condition. You could create a new slice and copy matches into it — that works, but doubles memory usage. When memory is already tight, that matters.

The naive approach — looping and deleting non-matches — shifts elements every deletion (O(n²)). The efficient way uses a separate write position.

The idea: read through every element, but only write the ones you want to keep. You need two positions — a "read" position (the loop variable) and a "write" position (`n`). They start together, but `n` only advances when you keep an element:

```go
words := []string{"keep", "drop", "keep", "drop", "keep"}

n := 0 // write position

for _, w := range words {
    if w == "keep" {
        words[n] = w
        n++
    }
    // non-matches: n stays put, so the next keeper overwrites the gap
}

words = words[:n] // shrink to only the kept elements
// Before: [keep drop keep drop keep]
// After:  [keep keep keep]
```

After the loop, everything before index `n` is a keeper. Everything at `n` and beyond is garbage. `words[:n]` slices it to just the good part.

**Parallel slice version** — same idea, but you use the index `i` to look up the corresponding element in another slice:

```go
fruits := []string{"apple", "banana", "cherry", "date"}
fresh := []bool{true, false, true, true}

n := 0
for i, ok := range fresh {
    if ok {
        fruits[n] = fruits[i]   // use i to index into the parallel slice
        n++
    }
}
fruits = fruits[:n]
// fruits = ["apple", "cherry", "date"]
```

The difference: with a single slice you iterate it directly (`for _, w`). With parallel slices you need the index (`for i, ok`) so you can reach into the other slice.

*Python comparison*

```python
# Python: filtered = [x for x in items if condition(x)]
# Go: no filter builtin. The write-index loop above IS the Go way.
```

<div class="inline-exercises" data-concept="In-Place Manipulation"></div>
