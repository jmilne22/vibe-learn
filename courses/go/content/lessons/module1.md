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

> **Run it:** Save as `main.go`, run with `go run main.go`

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

> **Gotcha:** `:=` only works inside functions. At package level, use `var`.

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

> **Zero Values:** Uninitialized variables get zero values: `""` for string, `0` for numbers, `false` for bool.

## Type Conversion

Go never converts types implicitly — you must be explicit every time.

*Python*

```python
x = 42
y = x + 3.14      # Python auto-converts int → float
s = "Age: " + str(x)  # Must convert to string for concat
n = int("99")      # String → int
```

*Go*

```go
x := 42
y := float64(x) + 3.14  // Must explicitly convert int → float64
n := int(3.9)            // Truncates to 3 (no rounding!)

// String ↔ number requires the strconv package
import "strconv"
s := strconv.Itoa(42)       // int → string: "42"
n, err := strconv.Atoi("99") // string → int: 99

// Single values ↔ strings
ch := string(65)     // int → string by code point: "A"
b := []byte("hello") // string → byte slice: [104 101 108 108 111]
r := []rune("café")  // string → rune slice (Unicode-safe)
```

> **Gotcha:** `int()` in Go **truncates** toward zero — `int(3.9)` is `3`, `int(-2.7)` is `-2`. Use `math.Round()` if you need rounding.

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

## Switch Statements

Go's `switch` is cleaner than a chain of if/else. No `break` needed — Go only runs the matching case.

*Basic switch*

```go
day := "Tuesday"
switch day {
case "Monday":
    fmt.Println("Start of the work week")
case "Tuesday", "Wednesday", "Thursday":
    fmt.Println("Midweek")
case "Friday":
    fmt.Println("Almost weekend!")
default:
    fmt.Println("Weekend!")
}
```

> **Key difference from C/Java:** Go cases don't fall through by default. Each case runs only its own code. (Use the rare `fallthrough` keyword if you explicitly need it — but you almost never do.)

*Expressionless switch (replaces if-else chains)*

```go
score := 85
switch {
case score >= 90:
    fmt.Println("A")
case score >= 80:
    fmt.Println("B")
case score >= 70:
    fmt.Println("C")
default:
    fmt.Println("F")
}
```

Here's the deal: an expressionless `switch` is just a cleaner way to write an if-else chain. Each case is a boolean expression, and the first `true` case wins.

## More Loop Forms

You saw the classic `for i := 0; i < n; i++` loop. But `for` in Go replaces `while` and even infinite loops:

*Loop variations*

```go
// Infinite loop (like while True in Python)
for {
    fmt.Println("forever")
    break // use break to exit!
}

// Condition-only loop (like while in Python)
n := 1
for n < 100 {
    n *= 2
}
fmt.Println(n) // 128

// continue skips to the next iteration
for i := 0; i < 10; i++ {
    if i%2 == 0 {
        continue // skip even numbers
    }
    fmt.Println(i) // 1, 3, 5, 7, 9
}
```

## The Blank Identifier `_`

When a function returns multiple values but you don't need all of them, use `_` to discard:

*Discarding values*

```go
// Don't need the index in a range loop
for _, name := range names {
    fmt.Println(name)
}

// Don't need the error (use sparingly!)
val, _ := strconv.Atoi("42")

// Don't need the value, just the key
for key, _ := range myMap {
    fmt.Println(key)
}
// Shorthand: omit the second variable entirely
for key := range myMap {
    fmt.Println(key)
}
```

> **Gotcha:** The Go compiler **refuses to compile** if you declare a variable and never use it. `_` is the escape hatch — but don't use it to ignore errors in production code!

## Constants and `iota`

Constants are values fixed at compile time. They can't change.

*Constants*

```go
const Pi = 3.14159
const MaxRetries = 3

// Const blocks group related constants
const (
    StatusOK    = 200
    StatusNotFound = 404
    StatusError = 500
)
```

`iota` is Go's auto-incrementing constant generator. It starts at 0 and increases by 1 for each line in a `const` block:

*iota for enumerations*

```go
const (
    Sunday = iota // 0
    Monday        // 1
    Tuesday       // 2
    Wednesday     // 3
    Thursday      // 4
    Friday        // 5
    Saturday      // 6
)

// Skip zero with _ to avoid "zero value means unset" bugs
const (
    _       = iota // skip 0
    Small          // 1
    Medium         // 2
    Large          // 3
)
```

> **Why `iota`?** It's Go's replacement for C-style enums. You get type safety (if you use a named type) and no need to manually number each constant.

## Exercises

Progress through each section in order, or jump to where you need practice.

Practice individual concepts you just learned.

<div id="warmups-container">
            <noscript><p class="js-required">JavaScript is required for the interactive exercises.</p></noscript>
            </div>

### 💪 Challenges

Apply Go fundamentals with hands-on coding challenges. Each challenge has multiple variants at different difficulties - shuffle to keep things fresh!

<div id="challenges-container">
            <noscript><p class="js-required">JavaScript is required for the interactive exercises.</p></noscript>
            </div>

> **Learning Path:** **Warmups** → master basic syntax with quick drills (5 concepts, 19 variants)
>
> **Challenges** → 7 exercises with 34 variants across easy/medium/hard difficulties
>
> **Log parser theme** — challenges 3-7 build toward a real log parser, composing functions progressively
>
> **Progressive difficulty:**
>
> • Use the "Get Easier Version" button if a challenge feels too hard
>
> • Use the "Get Harder Version" button to progressively challenge yourself
>
> • Filter by concept to focus on specific Go fundamentals
>
> • Shuffle to practice with fresh variants!
>
> Stuck? Check the tactical hints - they show you the code step by step!

## Module 1 Summary

### Core Concepts

- **:=** for declaration + assignment inside functions
- **Types:** string, int, float64, bool (statically typed!)
- **Type conversion:** `float64(x)`, `strconv.Itoa()`, `strconv.Atoi()` — always explicit
- **Functions:** `func name(params) returnType { }`
- **Multiple returns:** `func f() (int, error)`
- **Control flow:** `if`/`else if`/`else`, `for` is the only loop
- **range:** `for i, v := range collection` iterates over slices, maps, strings

### Key Patterns You Learned

- **Simultaneous assignment:** `a, b = b, a` - swap without temp variable
- **fmt.Sprintf:** Go's equivalent of Python f-strings
- **Error checking:** `result, err := f(); if err != nil { ... }`

### Common Gotchas

- **:= only works inside functions** - use `var` at package level
- **int() truncates** - `int(3.9)` is `3`, use `math.Round()` to round
- **No implicit type conversion** - must explicitly convert between types
- **No parentheses in if/for** - but braces `{}` are required

### Next Steps

You now have the syntax basics! Module 2 covers slices, maps, and strings — Go's core data structures for working with collections and text.
