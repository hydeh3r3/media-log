import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../chrome-nightly/notebook.js", import.meta.url), "utf8");
const nb = new Function("globalThis", `${source}\nreturn globalThis.MediaLogNotebook;`)({});

// Apply an edit to { value, start, end } the way the editor does.
function apply(state, edit) {
  if (!edit) return null;
  return {
    value: state.value.slice(0, edit.from) + edit.text + state.value.slice(edit.to),
    start: edit.selectionStart,
    end: edit.selectionEnd,
  };
}
// "|" marks the caret, "{" and "}" mark a selection.
function at(marked) {
  const start = marked.includes("{") ? marked.indexOf("{") : marked.indexOf("|");
  const value = marked.replace(/[|{}]/g, "");
  const end = marked.includes("}") ? marked.indexOf("}") - 1 : start;
  return { value, start, end };
}
const run = (fn, marked, ...args) => apply(at(marked), fn(at(marked), ...args));

// --- Counting ---
assert.deepEqual(nb.textStats(""), { words: 0, characters: 0, minutes: 0 });
assert.equal(nb.textStats("Frieren's journey, ep. 12 — wow!").words, 5);
assert.equal(nb.textStats("word ".repeat(460)).minutes, 2);
assert.equal(nb.formatStats(nb.textStats("one")), "1 word · 3 characters · 1 min read");
assert.equal(nb.formatStats(nb.textStats("")), "Empty note");
assert.equal(nb.formatClock(75), "1:15");
assert.equal(nb.formatClock(3725.9), "1:02:05");
assert.match(nb.formatStamp(new Date(2026, 10, 25, 9, 5)), /^Wed 25 Nov, 09:05$/);

// --- Lists continue on Enter ---
assert.deepEqual(run(nb.continueList, "- milk|"), { value: "- milk\n- ", start: 9, end: 9 });
assert.equal(run(nb.continueList, "1. one|").value, "1. one\n2. ");
assert.equal(run(nb.continueList, "  - [x] done|").value, "  - [x] done\n  - [ ] ");
assert.equal(run(nb.continueList, "> quoted|").value, "> quoted\n> ");
assert.equal(run(nb.continueList, "text\n- |").value, "text\n", "Enter on an empty item ends the list");
assert.equal(run(nb.continueList, "  - |").value, "- ", "Enter on an empty nested item outdents it");
assert.equal(nb.continueList(at("plain text|")), null);
assert.equal(nb.continueList(at("|- item")), null, "Enter before the marker is a normal newline");

// --- Line prefixes toggle, swap, and number ---
assert.equal(run(nb.toggleLinePrefix, "|item", "bullet").value, "- item");
assert.equal(run(nb.toggleLinePrefix, "- it|em", "bullet").value, "item");
assert.equal(run(nb.toggleLinePrefix, "- item|", "task").value, "- [ ] item");
assert.equal(run(nb.toggleLinePrefix, "{a\nb\n\nc}", "number").value, "1. a\n2. b\n\n3. c");
assert.equal(run(nb.toggleLinePrefix, "{1. a\n2. b}", "number").value, "a\nb");
assert.equal(run(nb.toggleLinePrefix, "Title|", "heading").value, "## Title");
assert.equal(run(nb.toggleLinePrefix, "\n|x", "quote").value, "\n> x", "Works on a line after a leading newline");

// --- Inline wrapping ---
assert.equal(run(nb.wrapSelection, "a {word} b", "**", "**", "bold").value, "a **word** b");
assert.equal(run(nb.wrapSelection, "a **{word}** b", "**", "**", "bold").value, "a word b");
assert.equal(run(nb.wrapSelection, "a {**word**} b", "**", "**", "bold").value, "a word b");
assert.equal(run(nb.wrapSelection, "a {word }b", "**", "**", "bold").value, "a **word** b", "Spaces stay outside");
assert.equal(run(nb.wrapSelection, "**{word}**", "*", "*", "italic").value, "***word***", "Italic inside bold adds italic");
const placeholder = run(nb.wrapSelection, "|", "*", "*", "italic text");
assert.equal(placeholder.value, "*italic text*");
assert.equal(placeholder.value.slice(placeholder.start, placeholder.end), "italic text");

// --- Indent, links, blocks, inline tokens, checkboxes ---
assert.equal(nb.isListSelection(at("- a|")), true);
assert.equal(nb.isListSelection(at("plain|")), false);
assert.equal(run(nb.indentLines, "{- a\n- b}").value, "  - a\n  - b");
assert.equal(run(nb.indentLines, "  - a|", true).value, "- a");
const link = run(nb.insertLink, "see {docs}");
assert.equal(link.value, "see [docs](https://)");
assert.equal(link.value.slice(link.start, link.end), "https://");
assert.equal(run(nb.insertLink, "{https://example.com}").value, "[link text](https://example.com)");
assert.equal(run(nb.insertBlock, "text|", "---").value, "text\n---\n");
assert.equal(run(nb.insertInline, "at|", "[1:15]").value, "at [1:15] ");
assert.equal(nb.toggleTaskLine("- [ ] a\n- [x] b", 0), "- [x] a\n- [x] b");
assert.equal(nb.toggleTaskLine("- [x] a", 0), "- [ ] a");
assert.equal(nb.toggleTaskLine("plain", 0), "plain");

// --- Markdown parsing ---
const blocks = nb.parseMarkdown([
  "# Episode 12",
  "Loved **this** scene at [12:34], see https://example.com/a.",
  "Second line",
  "",
  "- [ ] rewatch",
  "  - [x] read manga",
  "1. first",
  "> quote",
  "---",
  "```",
  "<script>alert(1)</script>",
  "```",
].join("\n"));
assert.deepEqual(blocks.map((block) => block.type), ["heading", "paragraph", "list", "list", "quote", "hr", "code"]);
assert.equal(blocks[0].level, 1);
assert.equal(blocks[1].lines.length, 2, "Single line breaks stay inside the paragraph");
const inline = blocks[1].lines[0].map((node) => node.type);
assert.deepEqual(inline, ["text", "strong", "text", "time", "text", "link", "text"]);
assert.equal(blocks[1].lines[0][5].href, "https://example.com/a", "Trailing punctuation is not part of a bare URL");
assert.deepEqual(blocks[2].items.map(({ checked, depth, line }) => ({ checked, depth, line })), [
  { checked: false, depth: 0, line: 4 },
  { checked: true, depth: 1, line: 5 },
]);
assert.equal(blocks[3].ordered, true);
assert.equal(blocks[6].text, "<script>alert(1)</script>", "Code is kept as text");

// Only http(s) links become links; everything else stays text.
const unsafe = nb.parseInline("[click](javascript:alert(1)) and data:text/html,hi");
assert.ok(unsafe.every((node) => node.type === "text"), "Unsafe schemes are never links");
assert.deepEqual(nb.parseInline("snake_case_name").map((node) => node.type), ["text"], "Underscores inside words are not italic");
assert.deepEqual(nb.parseInline("*a* and _b_ and ~~c~~ and `d`").map((node) => node.type), ["em", "text", "em", "text", "del", "text", "code"]);
assert.equal(nb.parseMarkdown("2 * 3 * 4 = 24")[0].type, "paragraph", "A lone asterisk is not a list");

// --- Rendering, through a minimal fake DOM: no HTML parsing, and only http(s) links become <a>. ---
function fakeDocument() {
  const node = (tagName) => ({
    tagName, children: [], dataset: {}, attributes: {},
    append(...items) { for (const item of items) this.children.push(item); },
    set textContent(text) { this.children = [String(text)]; },
  });
  return { createElement: (tag) => node(tag.toUpperCase()), createDocumentFragment: () => node("#fragment") };
}
const flatten = (item, out = []) => {
  if (typeof item === "string") return out;
  out.push(item);
  for (const child of item.children) flatten(child, out);
  return out;
};
const textOf = (item) => (typeof item === "string" ? item : item.children.map(textOf).join(""));
const rendered = nb.renderMarkdown([
  "<img src=x onerror=alert(1)> **bold** [ok](https://example.com/x) [bad](javascript:alert(1))",
  "- [ ] task",
].join("\n"), { document: fakeDocument() });
const elements = flatten(rendered);
const tags = elements.map((element) => element.tagName);
assert.ok(!tags.includes("IMG") && !tags.includes("SCRIPT"), "Raw HTML in a note stays text");
assert.ok(textOf(rendered).includes("<img src=x onerror=alert(1)>"), "The HTML is shown as written");
const links = elements.filter((element) => element.tagName === "A");
assert.deepEqual(links.map((link) => link.href), ["https://example.com/x"], "Only the http(s) link becomes a link");
assert.ok(links.every((link) => link.rel === "noopener noreferrer" && link.target === "_blank"));
const box = elements.find((element) => element.tagName === "INPUT");
assert.equal(box.disabled, true, "Checkboxes in saved notes are read-only");

console.log("Notebook editing helpers, counts, Markdown parsing and rendering, and link safety passed.");
