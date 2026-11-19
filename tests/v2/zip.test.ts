import { describe, expect, it } from "vitest";
import { createZip } from "../../src/renderer/zip";

describe("in-browser ZIP archive builder", () => {
  it("writes valid local headers, file payloads, central directory, and EOCD", () => {
    const zip = createZip(
      [
        { path: "README.md", contents: "# Hello\n" },
        { path: "steps/02-start.md", contents: "## Start\n" },
      ],
      "demo",
    );
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    // Starts with local file header signature PK\x03\x04
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    // Ends with EOCD signature PK\x05\x06 and entry count = 2
    const eocdOffset = zip.length - 22;
    expect(view.getUint32(eocdOffset, true)).toBe(0x06054b50);
    expect(view.getUint16(eocdOffset + 8, true)).toBe(2);
    expect(view.getUint16(eocdOffset + 10, true)).toBe(2);
    const text = new TextDecoder().decode(zip);
    expect(text).toContain("demo/README.md");
    expect(text).toContain("# Hello\n");
    expect(text).toContain("demo/steps/02-start.md");
    expect(text).toContain("## Start\n");
  });
});

