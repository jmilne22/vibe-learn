import { marked } from "marked";
import yaml from "js-yaml";
import sanitize from "sanitize-html";
import { load } from "cheerio";
import hljs from "highlight.js";
import { z } from "zod";
export const escape = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
export function clean(html: string): string {
  return sanitize(html, {
    allowedTags: [
      ...sanitize.defaults.allowedTags,
      "img",
      "details",
      "summary",
      "section",
      "figure",
      "figcaption",
    ],
    allowedAttributes: {
      "*": ["id", "class", "aria-label"],
      a: ["href", "title"],
      img: ["src", "alt", "width", "height"],
      code: ["class"],
      th: ["scope"],
      td: ["colspan"],
      details: ["open"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: { img: ["data"] },
    allowProtocolRelative: false,
  });
}
export function htmlText(html: string): string {
  const $ = load(html);
  $("p,h1,h2,h3,h4,pre,li,section,summary,tr").after("\n\n");
  $("br").replaceWith("\n");
  return $("body")
    .text()
    .replace(/\n[ \t]*\n[ \t]*\n/g, "\n\n")
    .trim();
}
function fence(code: string): string {
  return `<pre><code>${escape(code)}</code></pre>`;
}
export function markdown(source: string): string {
  let md = source.replace(/<\/?attempt\b[^>]*>/g, "\n");
  md = md.replace(
    /<predict([^>]*)>([\s\S]*?)<\/predict>/g,
    (_, attrs: string, body: string) => {
      const blocks = [...body.matchAll(/```[^\n]*\n([\s\S]*?)```/g)];
      const prompt =
        attrs.match(/prompt="([^"]*)"/)?.[1] || "Predict the output";
      return `\n<p><strong>${escape(prompt)}</strong></p>\n${fence(blocks[0]?.[1] || body)}\n<details><summary>Compare with the expected output</summary>${fence(blocks[1]?.[1] || "")}</details>\n`;
    },
  );
  md = md.replace(
    /<gaps([^>]*)>([\s\S]*?)<\/gaps>/g,
    (_, attrs: string, body: string) => {
      const code = body.match(/```[^\n]*\n([\s\S]*?)```/)?.[1] || body;
      return `\n<p>${escape(attrs.match(/prompt="([^"]*)"/)?.[1] || "Try completing this example")}</p>${fence(code.replace(/«[^»]*»/g, "____"))}<details><summary>Show completed example</summary>${fence(code.replace(/[«»]/g, ""))}</details>\n`;
    },
  );
  md = md.replace(
    /<variations[^>]*>([\s\S]*?)<\/variations>/g,
    (_, body: string) => {
      const data = z
        .object({
          template: z.string(),
          cases: z.array(z.record(z.string(), z.unknown())),
        })
        .parse(yaml.load(body));
      return (
        "\n" +
        data.cases
          .map(
            (c) =>
              `<details><summary>${escape(String(c.name || "Another example"))}</summary>${fence(data.template.replace(/{{\s*(\w+)\s*}}/g, (m, key: string) => (c[key] === undefined ? m : String(c[key]))))}</details>`,
          )
          .join("\n") +
        "\n"
      );
    },
  );
  const $ = load(marked.parse(md, { async: false }));
  $(
    ".inline-exercises, #warmups-container, #challenges-container, script, style, .self-rating, .project-check",
  ).remove();
  $("input[type=checkbox]").replaceWith("• ");
  $("pre code").each((_, el) => {
    const code = $(el);
    const language = (code.attr("class") || "").replace("language-", "");
    if (hljs.getLanguage(language))
      code.html(hljs.highlight(code.text(), { language }).value);
  });
  const seen = new Set<string>();
  $("h1,h2,h3,h4").each((_, el) => {
    const heading = $(el);
    let id =
      heading.attr("id") ||
      heading
        .text()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
    if (!id) id = "section";
    const base = id;
    let n = 2;
    while (seen.has(id)) id = `${base}-${n++}`;
    heading.attr("id", id);
    seen.add(id);
  });
  return clean($("body").html() || "");
}
