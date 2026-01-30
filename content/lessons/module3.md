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
u2 := User{"Bob", "bob@example.com", 25</span|}

// Zero value struct
var u3 User  // All fields are zero values

// Pointer to struct
u4 := &User{Name: "Charlie"</span|}

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

> **Rule:** <p>If any method needs a pointer receiver, make ALL methods use pointer receivers for consistency.</p>

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

> **Composition over Inheritance:** <p>This is more flexible than inheritance. You can embed multiple types and override methods.</p>

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

## Module 3 Summary

- **Structs** = Go's data containers (no classes)
- **Methods** = functions with receivers
- **Pointer receivers** for mutation, value receivers for reading
- **Embedding** = composition over inheritance
- **Tags** = metadata for JSON, DB, validation
- **NewX()** = constructor function pattern
