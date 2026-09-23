import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
const slug = process.argv[2];
if (!slug || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug))
  throw new Error("Usage: npm run new-course -- <lowercase-hyphenated-slug>");
const dir = path.resolve("courses", slug);
if (fs.existsSync(dir))
  throw new Error("This course directory already exists. Nothing was changed.");
for (const name of ["lessons", "assets"])
  fs.mkdirSync(path.join(dir, "content", name), { recursive: true });
fs.writeFileSync(
  path.join(dir, "course.yaml"),
  yaml.dump({
    course: {
      name: slug
        .split("-")
        .map((w) => w[0]!.toUpperCase() + w.slice(1))
        .join(" "),
      slug,
      description: "Describe what the learner can explore.",
    },
    modules: [{ id: "intro", title: "Introduction" }],
    projects: [],
  }),
);
fs.writeFileSync(
  path.join(dir, "content/lessons/moduleintro.md"),
  "## Welcome\n\nDescribe the subject, useful examples, and optional activities. Learners can begin anywhere.\n",
);
console.log(
  `Created ${dir}. Edit course.yaml and the Markdown lessons; run npm run validate:content.`,
);
