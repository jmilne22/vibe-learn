import { ItemSchema, type Exercise } from "../../../src/shared/model";
export const goExercise: Exercise = {
  id: "addition",
  title: "Fix addition",
  language: "go",
  stageId: "intro",
  instructionsHtml: "<p>Return the sum of two numbers.</p>",
  hintsHtml: ["<p>Use the addition operator.</p>"],
  solutionHtml: "<pre>return a + b</pre>",
  version: "go-v1",
  files: [
    { path: "go.mod", contents: "module addition\n\ngo 1.22\n" },
    {
      path: "addition.go",
      contents: "package addition\nfunc Add(a,b int) int { return 0 }\n",
    },
  ],
  checkFiles: [
    {
      path: "addition_test.go",
      contents:
        'package addition\nimport "testing"\nfunc TestAdd(t *testing.T) { if Add(2,3)!=5 {t.Fatal("expected 5")} }\n',
    },
  ],
};
export const rustExercise: Exercise = {
  ...goExercise,
  id: "rust-addition",
  title: "Fix Rust addition",
  language: "rust",
  version: "rust-v1",
  files: [
    {
      path: "Cargo.toml",
      contents: '[package]\nname="addition"\nversion="0.1.0"\nedition="2021"\n',
    },
    { path: "src/lib.rs", contents: "pub fn add(a:i32,b:i32)->i32 { a+b }\n" },
  ],
  checkFiles: [
    {
      path: "tests/addition.rs",
      contents: "#[test]\nfn adds() { assert_eq!(addition::add(2,3),5); }\n",
    },
  ],
};
export const fixtureCourse = ItemSchema.parse({
  id: "course:fixture",
  kind: "course",
  title: "Test-only course",
  description: "Only used by automated tests.",
  stages: [
    {
      id: "intro",
      title: "Introduction",
      text: "Addition",
      html: "<h2>Introduction</h2>",
    },
    {
      id: "next",
      title: "Another lesson",
      text: "Independent navigation",
      html: "<h2>Another lesson</h2>",
    },
  ],
  version: "1",
  source: "tests",
  exercises: [goExercise, rustExercise],
  flashcards: [
    {
      id: "sum",
      stageId: "intro",
      frontHtml: "<p>What is 2 + 3?</p>",
      backHtml: "<p>Five.</p>",
      version: "1",
    },
    {
      id: "negative",
      frontHtml: "<p>What is -1 + 1?</p>",
      backHtml: "<p>Zero.</p>",
      version: "1",
    },
  ],
});
