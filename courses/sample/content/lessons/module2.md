## How Exercises Work

Exercises live in YAML files under `content/exercises/`. Each file is named `moduleN-variants.yaml` and contains warmups and challenges with multiple variants per exercise.

When a user opens a module page, the engine loads the corresponding variant file and renders the exercises below the lesson content.

## The Variant System

Each exercise has multiple **variants** — different problems that test the same concept. The engine picks one variant at random each time, so repeated practice always feels fresh.

```yaml
id: warmup_1
concept: Variables
variants:
  - id: v1
    title: Declare an integer
    description: "..."
  - id: v2
    title: Declare a string
    description: "..."
  - id: v3
    title: Declare a boolean
    description: "..."
```

The user sees one variant at a time. They can shuffle to get a different one, or rate their confidence after attempting it.

## Self-Rating & SRS

After each exercise, users rate themselves:

| Rating | Meaning | SRS Effect |
|--------|---------|------------|
| **Got it** | Solved without help | Interval increases |
| **Struggled** | Solved with difficulty | Interval stays short |
| **Had to peek** | Needed the solution | Interval resets |

These ratings feed into the **spaced repetition system** (SRS), which schedules exercises for review at optimal intervals.

## Exercise YAML Structure

Here's the full structure of a variant file:

```yaml
conceptLinks:
  Concept Name: "#lesson-anchor"
sharedContent: {}
variants:
  warmups:
    - id: warmup_1
      concept: Concept Name
      variants:
        - id: v1
          title: Exercise Title
          description: What to do (HTML allowed).
          hints:
            - Hint 1
            - Hint 2
          solution: The solution code
          annotations:
            - type: tip
              label: Label
              text: Explanation.
  challenges: []
```

> **Tip:** The `description`, `hints`, and `annotations` fields support HTML, so you can use `<code>`, `<strong>`, etc.

## Daily Practice

The **Daily Practice** page pulls exercises from across all modules and builds focused sessions. It has four modes:

- **Review** — exercises due for SRS review
- **Weakest** — exercises the user struggles with most
- **Mixed** — combination of due and weak items
- **Discover** — random unseen exercises to learn new material

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

## Module 2 Summary

- Exercises are **YAML files** with warmups and challenges
- Each exercise has **multiple variants** for repeated practice
- Users **self-rate** after each exercise (got it / struggled / had to peek)
- Ratings feed an **SRS algorithm** for optimal review scheduling
- **Daily Practice** builds cross-module sessions from SRS data
