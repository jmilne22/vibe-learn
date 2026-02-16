## Numbers, Floats & Percentages

Infrastructure code mostly deals with integers (ports, counts, bytes), but reporting often needs percentages and formatted output.

### Percentage Calculation

In Go, dividing two ints gives an int — the decimal part is thrown away. `3 / 8` is `0`, not `0.375`. This is different from Python 3 where `/` always gives a float.

So to get a real percentage, you must convert to `float64` *before* dividing:

```go
passed := 7
total := 12

pct := float64(passed) / float64(total) * 100  // 58.333...
fmt.Printf("%.1f%%\n", pct)                     // "58.3%"
```

The `float64()` calls do the conversion. `%%` prints a literal percent sign (because `%` is the format specifier prefix).

### Rounding

`math.Round` rounds to the nearest integer. But what if you want 1 decimal place? There's no `math.Round(x, places)`. The trick: multiply to shift the decimal point, round, then divide back.

To round to 1 decimal: multiply by 10 (moves the tenths digit into the ones place), round, divide by 10:

```go
avg := 72.6789
rounded := math.Round(avg*10) / 10  // 72.7
// 72.6789 * 10 = 726.789 → Round → 727 → / 10 = 72.7
```

To round to 2 decimals, multiply/divide by 100. To round to the nearest integer, just `math.Round(x)`.

### Parsing Numbers from Strings

```go
import "strconv"

// String → int
n, err := strconv.Atoi("42")
if err != nil {
    // handle: "not a number"
}

// String → float64
f, err := strconv.ParseFloat("3.14", 64)
if err != nil {
    // handle: "not a number"
}
```

The second argument to `ParseFloat` is the bit size (64 for `float64`, 32 for `float32`). Always use 64.

<div class="inline-exercises" data-concept="Numbers & Percentages"></div>
