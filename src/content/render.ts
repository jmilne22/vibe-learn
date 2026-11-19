import { marked } from "marked";
import sanitize from "sanitize-html";
import { load } from "cheerio";
import hljs from "highlight.js";

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

export function markdown(source: string): string {
  const $ = load(marked.parse(source, { async: false }));
  $("script, style").remove();
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
