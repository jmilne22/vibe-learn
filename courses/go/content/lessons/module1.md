## Your First Go Program

*Python*

```python
print("Hello, World!")
```

*Go*

```go
package main

import "fmt"

func main() {
    fmt.Println("Hello, World!")
}
```

- **package main** — Entry point package
- **import "fmt"** — Import formatting package
- **func main()** — Entry point function

> **Run it:** <p>Save as `main.go`, run with `go run main.go`</p>

## Variables & Types

Python is dynamically typed. Go is statically typed. This is the biggest shift.

*Python*

```python
name = "Alice"
age = 30
height = 5.9
is_cool = True
```

*Go*

```go
// Explicit types
var name string = "Alice"
var age int = 30

// Type inference with :=
name := "Alice"
age := 30
height := 5.9
isCool := true
```

> **Gotcha:** <p>`:=` only works inside functions. At package level, use `var`.</p>

### Common Types

*Types*

```go
string   // "hello"
int      // 42 (platform-dependent size)
int64    // 64-bit integer
float64  // 3.14
bool     // true, false
byte     // alias for uint8
rune     // alias for int32 (Unicode code point)
```

> **Zero Values:** <p>Uninitialized variables get zero values: `""` for string, `0` for numbers, `false` for bool.</p>

## Functions

*Python*

```python
def add(a, b):
    return a + b

def greet(name):
    return f"Hello, {name}!"
```

*Go*

```go
func add(a int, b int) int {
    return a + b
}

func greet(name string) string {
    return fmt.Sprintf("Hello, %s!", name)
}
```

### Multiple Return Values

*Multiple returns*

```go
func divide(a, b float64) (float64, error) {
    if b == 0 {
        return 0, errors.New("division by zero")
    }
    return a / b, nil
}

result, err := divide(10, 2)
if err != nil {
    fmt.Println(err)
}
```

## Control Flow

### If Statements

*Python*

```python
if age >= 21:
    print("Can drink")
elif age >= 18:
    print("Can vote")
else:
    print("Too young")
```

*Go*

```go
if age >= 21 {
    fmt.Println("Can drink")
} else if age >= 18 {
    fmt.Println("Can vote")
} else {
    fmt.Println("Too young")
}
```

### For Loops (The Only Loop)

*Python*

```python
for i in range(5):
    print(i)

for i, item in enumerate(items):
    print(i, item)
```

*Go*

```go
for i := 0; i < 5; i++ {
    fmt.Println(i)
}

for i, item := range items {
    fmt.Println(i, item)
}
```

## Slices & Maps

### Slices (Dynamic Arrays)

*Slices*

```go
nums := []int{1, 2, 3}
nums = append(nums, 4)
fmt.Println(nums[0])     // 1
fmt.Println(len(nums))  // 4
fmt.Println(nums[1:3])   // [2 3]
```

### Maps (Dictionaries)

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

> **Remember the order!:** <p>**First variable** = the value you're looking for

                **Second variable** = boolean (did we find it?)

                Pattern: `value, found := map[key]`

                You can name them anything, but `ok` is conventional for the boolean.</p>

## Exercises

Progress through each section in order, or jump to where you need practice.

Practice individual concepts you just learned.

<div id="warmups-container">
            <noscript><p class="js-required">JavaScript is required for the interactive exercises.</p></noscript>
            </div>

### 💪 Challenges

Combine concepts and learn algorithmic patterns. Each challenge has multiple variants at different difficulties - shuffle to keep things fresh!

<div id="challenges-container">
            <noscript><p class="js-required">JavaScript is required for the interactive exercises.</p></noscript>
            </div>

> **Learning Path:** <p>**Warmups** → master basic syntax with quick drills (6 concepts, ~79 variants)

                **Challenges** → 14 exercises with 180 variants across easy/medium/hard difficulties

                **Progressive difficulty:**

                • Use the "Get Easier Version" button if a challenge feels too hard

                • Use the "Get Harder Version" button to progressively challenge yourself

                • Filter by pattern/concept to focus on specific algorithmic techniques

                • Shuffle to practice with fresh variants!

                Stuck? Check the tactical hints - they show you the code step by step!</p>

## Module 1 Summary

### Core Concepts

- **:=** for declaration + assignment inside functions
- **Types:** string, int, float64, bool (statically typed!)
- **Functions:** `func name(params) returnType { }`
- **Multiple returns:** `func f() (int, error)`
- **Slices:** `[]Type{}` - dynamic arrays
- **Maps:** `map[KeyType]ValueType{}` - like dictionaries

### Key Patterns You Learned

- **The "comma ok" idiom:** `value, ok := map[key]` - check if a map key exists
- **Simultaneous assignment:** `a, b = b, a` - swap without temp variable

### Algorithm Patterns & When to Use Them

- **Two-pointer (opposite ends):** When you need to work from both ends toward the middle
                    <ul style="margin-top: 0.5rem;">
                        <li>Palindrome checking
- Reversing arrays/strings
- Pattern: `for i, j := 0, len(arr)-1; i < j; i, j = i+1, j-1`
- **Slow/fast pointers:** When one pointer reads and another writes, moving at different speeds
                    <ul style="margin-top: 0.5rem;">
                        <li>Removing duplicates from sorted arrays
- In-place array modifications
- Pattern: `slow := 0` outside, `for fast := 1; ...` inside
- **Map for tracking:** When you need to remember "have I seen this before?"
                    <ul style="margin-top: 0.5rem;">
                        <li>Finding duplicates
- Counting occurrences
- Two Sum (storing complements)
- Pattern: Check map first, then add to map if not found
- **Building slices with append:** When you need to filter or transform data
                    <ul style="margin-top: 0.5rem;">
                        <li>Filtering even numbers
- Collecting results dynamically
- Pattern: Start with `result := []Type{}`, then `result = append(result, item)`
- **Sliding window:** When you need to find something optimal in a contiguous subarray
                    <ul style="margin-top: 0.5rem;">
                        <li>Max sum subarray of size k (fixed window)
- Longest substring without repeating chars (variable window)
- Pattern (fixed): Calculate first window, then slide by adding new element and subtracting old
- Pattern (variable): Expand right pointer, shrink left when condition met/violated

### Common Gotchas

- **Missing map keys return zero values** - use "comma ok" to check if key exists
- **Strings are bytes, not characters** - use `[]rune(s)` for Unicode
- **Slices are references** - modifying a slice modifies the original
- **:= only works inside functions** - use `var` at package level

### Next Steps

You now have the fundamentals to solve many LeetCode Easy problems! Module 2 will cover pointers, structs, and methods - the building blocks for more complex programs.
