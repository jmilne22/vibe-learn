## Pointers, Structs & Methods

---

## What Even Is a Pointer?

In Python, you never think about this. In Go, you sometimes do. Here's the deal:

A **pointer** is just a variable that holds a **memory address** instead of a direct value.

// Visual representation

Regular variable:

x := 42

┌─────────┐

│   42    │  ← x holds the value directly

└─────────┘

Pointer variable:

p := &x

┌─────────┐      ┌─────────┐

│ 0xc0001 │ ──→  │   42    │  ← p holds address, points to value

└─────────┘      └─────────┘

p               x

### The Two Operators

*Pointer operators*

```go
x := 42

// & = "address of" — get the memory address
p := &x        // p is now a pointer to x
fmt.Println(p)  // 0xc0000b4008 (some memory address)

// * = "dereference" — get the value at address
fmt.Println(*p) // 42 (the actual value)

// Modify through pointer
*p = 100
fmt.Println(x)  // 100 — x changed!
```

> **Memory Trick:** `&` = "get **A**ddress" (& looks like 'A')
>
> `*` = "get value" (go *****through the pointer)

## How Python Handles This

Python has pointers too — you just can't see them. Everything in Python is a reference.

*Python (hidden references)*

```python
# Lists are mutable, passed by ref
def modify(lst):
    lst.append(4)

my_list = [1, 2, 3]
modify(my_list)
print(my_list)  # [1, 2, 3, 4] changed!

# Ints are immutable
def modify_int(x):
    x = 100

n = 42
modify_int(n)
print(n)  # 42 unchanged
```

*Go (explicit choice)*

```go
// Slices work like Python lists
func modify(s []int) {
    s[0] = 999  // Modifies original
}

// Ints: pass by value (copy)
func modifyInt(x int) {
    x = 100  // Only changes copy
}

// Ints: pass by pointer (reference)
func modifyIntPtr(x *int) {
    *x = 100  // Changes original!
}

n := 42
modifyIntPtr(&n)  // Pass address
fmt.Println(n)     // 100
```

**The difference:** Go makes you choose explicitly. Python hides the decision based on mutability.

## When to Use Pointers

### Use Pointers When:

1. **You need to modify the original:** Functions receive copies by default
2. **The data is large:** Copying big structs is slow; pass a pointer instead
3. **You need to express "nothing":** Pointers can be `nil`
4. **Consistency:** If some methods need pointers, make all methods use pointers

### Don't Use Pointers When:

1. **Data is small:** `int`, `bool`, small structs — copying is fine
2. **You want immutability:** Pass by value guarantees the original won't change
3. **Slices, maps, channels:** Already reference types (sort of)

*Practical examples*

```go
// ❌ Unnecessary pointer — int is tiny
func double(x *int) int {
    return *x * 2
}

// ✓ Just take the value
func double(x int) int {
    return x * 2
}

// ✓ Pointer needed — modifying a struct
func (u *User) UpdateEmail(email string) {
    u.Email = email
}

// ✓ Pointer useful — large struct
type BigData struct {
    Items [10000]int
}
func process(d *BigData) { /* ... */ }
```

## nil: The Absence of a Value

A pointer that points to nothing is `nil`. It's Go's equivalent of Python's `None` for pointers.

*nil pointers*

```go
var p *int           // Declared but not initialized
fmt.Println(p)       // <nil>
fmt.Println(p == nil) // true

// DANGER: Dereferencing nil crashes!
// fmt.Println(*p)  // panic: runtime error

// Always check for nil
if p != nil {
    fmt.Println(*p)
}
```

### Using nil for "Optional" Values

*nil as optional*

```go
type Config struct {
    Timeout *time.Duration  // nil = use default
    MaxSize *int             // nil = unlimited
}

func NewServer(cfg Config) *Server {
    timeout := 30 * time.Second  // default
    if cfg.Timeout != nil {
        timeout = *cfg.Timeout
    }
    // ...
}

// Usage
customTimeout := 60 * time.Second
NewServer(Config{Timeout: &customTimeout})
NewServer(Config{})  // Uses defaults
```

> **nil Panic:** Dereferencing a nil pointer causes a panic (crash). Always check `!= nil` before using `*p`.

## Pointer Receivers on Methods

This is where pointers matter most in day-to-day Go.

*Value vs Pointer receivers*

```go
type Counter struct {
    count int
}

// Value receiver: gets a COPY
func (c Counter) IncrementBroken() {
    c.count++  // Increments the copy, not original!
}

// Pointer receiver: gets the original
func (c *Counter) Increment() {
    c.count++  // Actually increments
}

func main() {
    c := Counter{}

    c.IncrementBroken()
    fmt.Println(c.count)  // 0 — didn't work!

    c.Increment()
    fmt.Println(c.count)  // 1 — works!
}
```

### The Rule of Thumb

- If **any** method needs a pointer receiver, make **all** methods use pointer receivers
- Pointer receivers for: mutation, large structs, consistency
- Value receivers for: small immutable types, when you want a copy

> **Go Does Some Magic:** You can call pointer methods on values and vice versa -- Go automatically converts. But be consistent anyway.

## Creating Pointers: new() and &

*Different ways to create pointers*

```go
// Method 1: & operator (most common)
x := 42
p := &x

// Method 2: new() — allocates zeroed memory, returns pointer
p := new(int)      // *int pointing to 0
*p = 42

// Method 3: For structs, use & with literal
user := &User{Name: "Alice"}  // Returns *User

// Equivalent to:
user := new(User)
user.Name = "Alice"
```

### new() vs make()

*new vs make*

```go
// new() — for any type, returns pointer to zero value
p := new(int)        // *int → 0
s := new([]int)      // *[]int → nil slice (not useful!)

// make() — ONLY for slices, maps, channels
// Returns initialized (not pointer!) value
slice := make([]int, 10)        // []int with len=10
m := make(map[string]int)       // Initialized map
ch := make(chan int, 5)         // Buffered channel
```

> **Rule:** `new()` = zero value + pointer. `make()` = initialized slice/map/channel (no pointer).

## Common Pointer Mistakes

### Mistake 1: Returning Address of Local Variable... is Fine!

*This is actually okay in Go*

```go
func newUser() *User {
    u := User{Name: "Alice"}
    return &u  // Fine! Go moves u to heap
}
// In C this would be a bug. Go's escape analysis handles it.
```

### Mistake 2: Modifying Loop Variable

*Loop variable trap*

```go
users := []User{{Name: "A"}, {Name: "B"}, {Name: "C"}}
var ptrs []*User

// ❌ WRONG: All pointers point to same address!
for _, u := range users {
    ptrs = append(ptrs, &u)  // &u is same address each iteration
}
// All ptrs[i] point to "C"!

// ✓ CORRECT: Use index
for i := range users {
    ptrs = append(ptrs, &users[i])
}

// ✓ OR in Go 1.22+: loop var is new each iteration
```

### Mistake 3: Forgetting nil Check

*Nil checks*

```go
func process(u *User) {
    // ❌ Crashes if u is nil
    fmt.Println(u.Name)

    // ✓ Check first
    if u == nil {
        return
    }
    fmt.Println(u.Name)
}
```

---

## Structs vs Classes

Go doesn't have classes. Instead, it has structs + methods. It's simpler and more flexible.

*Python Class*

```python
class User:
    def __init__(self, name, age):
        self.name = name
        self.age = age

    def greet(self):
        return f"Hi, I'm {self.name}"

u = User("Alice", 30)
```

*Go Struct*

```go
type User struct {
    Name string
    Age  int
}

func (u User) Greet() string {
    return fmt.Sprintf("Hi, I'm %s", u.Name)
}

u := User{Name: "Alice", Age: 30}
```

## Creating Structs

*Different ways to create structs*

```go
type User struct {
    Name  string
    Email string
    Age   int
}

// Named fields (preferred)
u1 := User{Name: "Alice", Email: "alice@example.com", Age: 30}

// Positional (fragile, avoid)
u2 := User{"Bob", "bob@example.com", 25}

// Zero value struct
var u3 User  // All fields are zero values

// Pointer to struct
u4 := &User{Name: "Charlie"}

// Access fields
fmt.Println(u1.Name)
u1.Age = 31
```

## Methods

Methods are functions with a **receiver** — the struct they operate on.

*Value vs Pointer Receivers*

```go
type Counter struct {
    count int
}

// Value receiver: gets a COPY
func (c Counter) Value() int {
    return c.count
}

// Pointer receiver: modifies original
func (c *Counter) Increment() {
    c.count++
}

c := Counter{}
c.Increment()
fmt.Println(c.Value())  // 1
```

> **Rule:** If any method needs a pointer receiver, make ALL methods use pointer receivers for consistency.

## Struct Embedding (Composition)

Go doesn't have inheritance. Instead, embed structs to compose behavior.

*Embedding*

```go
type Person struct {
    Name string
    Age  int
}

func (p Person) Greet() string {
    return "Hi, I'm " + p.Name
}

// Employee embeds Person
type Employee struct {
    Person          // Embedded (no field name)
    Company string
    Salary  int
}

e := Employee{
    Person:  Person{Name: "Alice", Age: 30},
    Company: "Acme",
    Salary:  100000,
}

// Access embedded fields directly
fmt.Println(e.Name)     // "Alice" - promoted from Person
fmt.Println(e.Greet())  // "Hi, I'm Alice" - method promoted
```

> **Composition over Inheritance:** This is more flexible than inheritance. You can embed multiple types and override methods.

## Struct Tags

Tags add metadata to fields — used for JSON, database mapping, validation, etc.

*Struct tags*

```go
type User struct {
    ID        int       `json:"id" db:"user_id"`
    Name      string    `json:"name"`
    Email     string    `json:"email" validate:"required,email"`
    Password  string    `json:"-"`              // Excluded from JSON
    CreatedAt time.Time `json:"created_at,omitempty"`
}

// JSON encoding respects tags
user := User{ID: 1, Name: "Alice", Password: "secret"}
data, _ := json.Marshal(user)
// {"id":1,"name":"Alice","email":""}
// Note: Password excluded, CreatedAt omitted (zero value)
```

## Constructor Functions

Go doesn't have constructors. Use factory functions instead.

*Constructor pattern*

```go
type Server struct {
    host    string
    port    int
    timeout time.Duration
}

// Constructor function (convention: New + TypeName)
func NewServer(host string, port int) *Server {
    return &Server{
        host:    host,
        port:    port,
        timeout: 30 * time.Second, // Default value
    }
}

// With validation
func NewServer(host string, port int) (*Server, error) {
    if port < 1 || port > 65535 {
        return nil, errors.New("invalid port")
    }
    return &Server{host: host, port: port}, nil
}
```

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

## Module Summary

- **&** gets the address, ***** dereferences (gets value)
- **Use pointers** to modify originals or avoid copying large data
- **nil** = pointer to nothing — always check before dereferencing
- **Pointer receivers** let methods modify structs
- **new()** = zero value pointer, **make()** = initialized slice/map/channel
- **Go handles memory** — you don't free things manually
- **Structs** = Go's data containers (no classes)
- **Methods** = functions with receivers
- **Embedding** = composition over inheritance
- **Tags** = metadata for JSON, DB, validation
- **NewX()** = constructor function pattern

> **The Mantra:** When in doubt, start without pointers. Add them when you need mutation or have large data.
