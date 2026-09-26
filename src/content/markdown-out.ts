import { load } from "cheerio";
import type { AnyNode, Element } from "domhandler";
// Converts sanitised stage HTML into Markdown for learner workspace files.
// Links pass through resolveLink; returning null keeps only the link text.
export type LinkResolver = (href: string) => string | null;
const external: LinkResolver = (href) =>
  /^(https?:|mailto:)/.test(href) ? href : null;
const BLOCK = new Set([
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "pre",
  "ul",
  "ol",
  "li",
  "table",
  "details",
  "summary",
  "blockquote",
  "section",
  "div",
  "header",
  "main",
  "article",
  "figure",
  "figcaption",
  "caption",
  "hr",
]);
const isElement = (node: AnyNode): node is Element => node.type === "tag";
const isBlock = (node: AnyNode) => isElement(node) && BLOCK.has(node.name);
function textOf(node: AnyNode): string {
  if (node.type === "text") return node.data;
  if (isElement(node)) return node.children.map(textOf).join("");
  return "";
}
function codeSpan(text: string): string {
  const longest = Math.max(
    0,
    ...(text.match(/`+/g) || []).map((m) => m.length),
  );
  const ticks = "`".repeat(longest + 1);
  const pad = text.startsWith("`") || text.endsWith("`") ? " " : "";
  return `${ticks}${pad}${text}${pad}${ticks}`;
}
export function htmlToMarkdown(
  html: string,
  resolveLink: LinkResolver = external,
): string {
  const $ = load(html);
  const inline = (nodes: AnyNode[]): string =>
    nodes
      .map((node): string => {
        if (node.type === "text") return node.data.replace(/\s+/g, " ");
        if (!isElement(node)) return "";
        const inner = () => inline(node.children).trim();
        switch (node.name) {
          case "code":
            return codeSpan(textOf(node));
          case "strong":
          case "b": {
            const text = inner();
            return text ? `**${text}**` : "";
          }
          case "em":
          case "i": {
            const text = inner();
            return text ? `*${text}*` : "";
          }
          case "a": {
            const text = inner();
            const href = node.attribs.href;
            const target = href ? resolveLink(href) : null;
            return target && text ? `[${text}](${target})` : text;
          }
          case "br":
            return "\n";
          case "img":
            return node.attribs.alt || "";
          default:
            return inline(node.children);
        }
      })
      .join("");
  const paragraph = (nodes: AnyNode[]) =>
    inline(nodes)
      .split("\n")
      .map((line) => line.replace(/ +/g, " ").trim())
      .join("\n")
      .trim();
  const blocks = (nodes: AnyNode[], separator = "\n\n"): string => {
    const out: string[] = [];
    let run: AnyNode[] = [];
    const flush = () => {
      const text = paragraph(run);
      if (text) out.push(text);
      run = [];
    };
    for (const node of nodes) {
      if (!isBlock(node)) {
        run.push(node);
        continue;
      }
      flush();
      const text = block(node as Element);
      if (text.trim()) out.push(text);
    }
    flush();
    return out.join(separator);
  };
  const list = (node: Element): string => {
    const ordered = node.name === "ol";
    let n = Number(node.attribs.start) || 1;
    return node.children
      .filter((c): c is Element => isElement(c) && c.name === "li")
      .map((li) => {
        const marker = ordered ? `${n++}. ` : "- ";
        const pad = " ".repeat(marker.length);
        // Keep simple items tight; items with paragraphs or code stay loose.
        const loose = li.children.some(
          (c) =>
            isElement(c) && ["p", "pre", "details", "table"].includes(c.name),
        );
        const [first = "", ...rest] = blocks(
          li.children,
          loose ? "\n\n" : "\n",
        ).split("\n");
        return (
          marker +
          first +
          rest.map((line) => "\n" + (line ? pad + line : "")).join("")
        );
      })
      .join("\n");
  };
  const table = (node: Element): string => {
    const rows = $(node)
      .find("tr")
      .toArray()
      .map((tr) =>
        tr.children
          .filter(
            (c): c is Element =>
              isElement(c) && (c.name === "th" || c.name === "td"),
          )
          .map((cell) =>
            paragraph(cell.children).replace(/\n/g, " ").replace(/\|/g, "\\|"),
          ),
      )
      .filter((cells) => cells.length);
    if (!rows.length) return "";
    const width = Math.max(...rows.map((r) => r.length));
    const line = (cells: string[]) =>
      `| ${Array.from({ length: width }, (_, i) => cells[i] ?? "").join(" | ")} |`;
    const caption = $(node).children("caption").first();
    return [
      caption.length ? `*${paragraph(caption.toArray()[0]!.children)}*\n` : "",
      line(rows[0]!),
      line(Array.from({ length: width }, () => "---")),
      ...rows.slice(1).map(line),
    ]
      .filter(Boolean)
      .join("\n");
  };
  const block = (node: Element): string => {
    switch (node.name) {
      case "h1":
      case "h2":
      case "h3":
      case "h4":
      case "h5":
      case "h6":
        return `${"#".repeat(Number(node.name[1]))} ${paragraph(node.children).replace(/\n/g, " ")}`;
      case "p":
      case "figcaption":
        return paragraph(node.children);
      case "pre": {
        const code = $(node).children("code").first();
        const language = /language-([\w+-]+)/.exec(
          code.attr("class") || "",
        )?.[1];
        const text = textOf(node).replace(/\n+$/, "");
        const longest = Math.max(
          2,
          ...(text.match(/`{3,}/g) || []).map((m) => m.length),
        );
        const fence = "`".repeat(longest + 1);
        return `${fence}${language || ""}\n${text}\n${fence}`;
      }
      case "ul":
      case "ol":
        return list(node);
      case "table":
        return table(node);
      case "caption":
        return "";
      case "hr":
        return "---";
      case "blockquote":
        return blocks(node.children)
          .split("\n")
          .map((line) => (line ? `> ${line}` : ">"))
          .join("\n");
      case "details": {
        // Kept as HTML so hints stay folded in Markdown previews.
        const summary = node.children.find(
          (c): c is Element => isElement(c) && c.name === "summary",
        );
        const title = summary
          ? paragraph(summary.children).replace(/\n/g, " ")
          : "Details";
        const body = blocks(node.children.filter((c) => c !== summary));
        return `<details>\n<summary>${title.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</summary>\n\n${body}\n\n</details>`;
      }
      default:
        return blocks(node.children);
    }
  };
  const body = $("body").first().toArray()[0];
  return blocks(body ? body.children : []).trim() + "\n";
}
