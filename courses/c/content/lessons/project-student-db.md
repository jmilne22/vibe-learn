## Project 2: Student Database

### What You'll Build

A command-line CRUD application for managing student records with file persistence. Combines structs, dynamic memory allocation, and file I/O into a practical application.

### Concepts Applied

- Structs for data modeling
- Dynamic arrays with malloc/realloc
- File I/O for persistent storage
- Command-line interface design
- Memory management discipline (no leaks)

### Example

```
$ ./studentdb
> add "Alice Smith" 3.8
Added student #1: Alice Smith (GPA: 3.80)
> add "Bob Jones" 3.2
Added student #2: Bob Jones (GPA: 3.20)
> list
#1  Alice Smith     3.80
#2  Bob Jones       3.20
> save students.dat
Saved 2 records to students.dat
> quit
```

---

*Content coming soon.* This project will guide you through building a student database from scratch, introducing patterns for managing collections of structured data with proper memory management and file persistence.
