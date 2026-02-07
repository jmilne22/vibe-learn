## Slices

*Slices*

```go
nums := []int{1, 2, 3}
nums = append(nums, 4)
fmt.Println(nums[0])     // 1
fmt.Println(len(nums))  // 4
fmt.Println(nums[1:3])   // [2 3]
```

## Indexing & Slice Expressions

*Python*

```python
nums = [10, 20, 30, 40, 50]
nums[0]       # First: 10
nums[-1]      # Last: 50
nums[1:3]     # Slice: [20, 30]
nums[:3]      # First 3: [10, 20, 30]
nums[2:]      # From index 2: [30, 40, 50]
```

*Go*

```go
nums := []int{10, 20, 30, 40, 50}

// Basic indexing
first := nums[0]              // 10
last := nums[len(nums)-1]     // 50 (no negative indexing!)

// Slice expressions: nums[from:to] — includes 'from', excludes 'to'
middle := nums[1:3]           // [20 30]
firstThree := nums[:3]        // [10 20 30]
fromTwo := nums[2:]           // [30 40 50]
copyAll := nums[:]            // [10 20 30 40 50] (shallow copy)

// Index math patterns (common in exercises)
for i := 0; i < len(nums)-1; i++ {
    // Look-ahead: compare current with next
    if nums[i] < nums[i+1] {
        fmt.Println(nums[i], "< next")
    }
}

for i := 1; i < len(nums); i++ {
    // Look-behind: compare current with previous
    diff := nums[i] - nums[i-1]
    fmt.Println(diff)
}

// From the end
lastThree := nums[len(nums)-3:]  // [30 40 50]
```

*String indexing*

```go
s := "hello"
b := s[0]       // 104 (byte value of 'h', not a string!)
sub := s[1:3]   // "el" (substring)
```

> **Gotcha:** Go has no negative indexing — use `len(s)-1` for the last element. Slice expressions create a **view**, not a copy — both share the same underlying array.

## Creating with make()

Use literals when you know the contents. Use `make()` when you need an empty collection to fill dynamically.

*Python*

```python
zeros = [0] * 5       # [0, 0, 0, 0, 0]
result = []            # Empty list, append later
counts = {}            # Empty dict
```

*Go*

```go
// Slice with length 5, all zero values
zeros := make([]int, 5)          // [0 0 0 0 0]

// Empty slice with capacity hint (avoids reallocations)
result := make([]int, 0, 10)     // len=0, cap=10
result = append(result, 42)      // [42]

// Empty map, ready to use
counts := make(map[string]int)
counts["hello"] = 1
```

> **Gotcha:** A `nil` slice works with `append` but **panics** if you index into it — use `make()` when you need to assign by index (e.g., `result[i] = value`).

## Strings, Bytes & Runes

Go strings are sequences of **bytes**, not characters. This matters for non-ASCII text.

*Strings are bytes*

```go
s := "café"
fmt.Println(len(s))    // 5 (bytes), not 4!
fmt.Println(s[3])      // 169 (a byte, not 'é')
```

*Working with runes (characters)*

```go
runes := []rune("café")
fmt.Println(len(runes))         // 4 (characters)
fmt.Println(string(runes[:3]))  // "caf" (first 3 characters, Unicode-safe)

// Range iterates by rune, not byte
for i, ch := range "café" {
    fmt.Printf("index %d: %c\n", i, ch)
    // index 0: c, index 1: a, index 2: f, index 3: é
}
```

*Python comparison*

```python
# Python 3 strings are already Unicode
s = "café"
len(s)    # 4 (characters, not bytes)
s[:3]     # "caf"
```

> **Rule of thumb:** Use `string` for most work. Convert to `[]rune` when you need to index or slice by **character position**.

## Maps

*Creating and using maps*

```go
ages := map[string]int{
    "alice": 30,
    "bob":   25,
}
ages["charlie"] = 35  // Add new key

fmt.Println(ages["alice"])  // 30
```

The Missing Key Problem

In Python, accessing a missing key raises `KeyError`. In Go, it returns the **zero value** (0 for int, "" for string, etc). This means you can't tell if a key is missing or just has a zero value!

*The "comma ok" idiom - checking if a key exists*

```go
// Wrong: Can't tell if dave is missing or age is 0
age := ages["dave"]  // Returns 0 (zero value)

// Right: Use the "comma ok" pattern
// ORDER: value, exists := map[key]
//        ↑      ↑
//        │      └── boolean: true if found, false if not
//        └── the actual value (or zero value)

age, ok := ages["dave"]
// age = 0 (zero value for int)
// ok = false (key doesn't exist)

if ok {
    fmt.Println("Found:", age)
} else {
    fmt.Println("Not found")  // This prints
}

// Common shorthand: declare inside if statement
if age, ok := ages["alice"]; ok {
    //   ↑    ↑
    //   30  true
    fmt.Println("Alice is", age)  // Prints: Alice is 30
}
```

*Python equivalent*

```python
# In Python, you might do:
age = ages.get("dave")  # Returns None if missing
if age is not None:
    print(f"Found: {age}")

# Or check with 'in':
if "dave" in ages:
    print(f"Found: {ages['dave']}")
```

> **Remember the order!:**
>
> **First variable** = the value you're looking for
>
> **Second variable** = boolean (did we find it?)
>
> Pattern: `value, found := map[key]`
>
> You can name them anything, but `ok` is conventional for the boolean.

## Exercises

Progress through each section in order, or jump to where you need practice.

Practice individual concepts you just learned.

<div id="warmups-container">
            <noscript><p class="js-required">JavaScript is required for the interactive exercises.</p></noscript>
            </div>

### 💪 Challenges

Apply what you learned about slices, maps, and strings with hands-on coding challenges. Each challenge has multiple variants at different difficulties - shuffle to keep things fresh!

<div id="challenges-container">
            <noscript><p class="js-required">JavaScript is required for the interactive exercises.</p></noscript>
            </div>

## Module 2 Summary

### Core Concepts

- **Slices:** `[]Type{}` - dynamic arrays
- **Indexing & slicing:** `nums[0]`, `nums[1:3]`, `nums[len(nums)-1]`
- **make():** `make([]int, n)`, `make(map[K]V)` — for dynamic allocation
- **Maps:** `map[KeyType]ValueType{}` - like dictionaries
- **Runes:** `[]rune(s)` for Unicode-safe character work

### Key Patterns You Learned

- **The "comma ok" idiom:** `value, ok := map[key]` - check if a map key exists
- **Look-ahead/behind:** `nums[i+1]`, `nums[i-1]` — compare adjacent elements in loops
- **From the end:** `nums[len(nums)-1]` (last), `nums[len(nums)-3:]` (last 3)
- **Rune conversion round-trip:** `[]rune(s)` → manipulate → `string(runes)`

### Common Gotchas

- **Missing map keys return zero values** - use "comma ok" to check if key exists
- **Strings are bytes, not characters** - use `[]rune(s)` for Unicode
- **Slices are references** - modifying a slice modifies the original
- **No negative indexing** - use `len(s)-1` instead of `s[-1]`
- **Nil slices panic on index** - use `make()` when assigning by index

### Next Steps

You now have the fundamentals to solve many LeetCode Easy problems! Module 3 will cover pointers, structs, and methods - the building blocks for more complex programs.
