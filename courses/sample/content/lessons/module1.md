## Welcome

This is a sample module to show you how vibe-learn lessons work. Everything you see here is written in plain markdown and converted to HTML at build time.

Lessons support all standard markdown: **bold**, *italic*, `inline code`, [links](#), lists, tables, and more.

## Code Blocks

Fenced code blocks get automatic syntax highlighting via highlight.js.

```python
def greet(name: str) -> str:
    """Return a greeting."""
    return f"Hello, {name}!"

print(greet("World"))
```

```javascript
function greet(name) {
    return `Hello, ${name}!`;
}

console.log(greet("World"));
```

You can use any language highlight.js supports — just set the language after the opening fence.

## Side-by-Side Code Comparisons

If you put a label (italic text) right before a code block, the engine wraps it in a styled header. Two consecutive labeled blocks become a side-by-side comparison:

*Python*

```python
for i in range(5):
    print(i)
```

*JavaScript*

```javascript
for (let i = 0; i < 5; i++) {
    console.log(i);
}
```

This is great for showing the same concept in different languages, or before/after refactoring.

## Callout Blocks

Use blockquotes with a bold label to create callout boxes:

> **Tip:** This is a callout block. Use them for important notes, warnings, or tips. The bold label at the start sets the tone.

> **Warning:** Callouts support the full range of Markdown formatting, including bold, italic, code, and links.

## Tables

| Feature | Supported |
|---------|-----------|
| Markdown tables | Yes |
| Code blocks | Yes |
| Syntax highlighting | Yes |
| Side-by-side comparisons | Yes |
| Callout blocks | Yes |
| Exercises | Yes |
| Flashcards | Yes |

## Lists

Things you can include in a lesson:

- Markdown text with inline formatting
- Fenced code blocks with syntax highlighting
- Labeled code comparisons (side-by-side)
- Blockquote callouts with bold labels
- Tables, lists, headings, links
- HTML when markdown isn't enough
- Exercise sections (warmups + challenges)

## Exercises

Progress through each section in order, or jump to where you need practice.

Practice individual concepts you just learned.

<div id="warmups-container">
            <noscript><p class="js-required">JavaScript is required for the interactive exercises.</p></noscript>
            </div>

### Challenges

Combine concepts and learn patterns. Each challenge has multiple variants at different difficulties.

<div id="challenges-container">
            <noscript><p class="js-required">JavaScript is required for the interactive exercises.</p></noscript>
            </div>

## Module 1 Summary

- Write lessons in **markdown** — the build script converts them to HTML
- Use **fenced code blocks** with language tags for syntax highlighting
- **Label code blocks** with italic text for headers; consecutive labeled blocks go side-by-side
- Use **blockquotes** with bold labels for callouts
- Add an **Exercises** section with warmup/challenge containers at the bottom
