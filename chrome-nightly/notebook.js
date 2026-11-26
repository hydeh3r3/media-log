/* Media Log notebook: a full-size Markdown editor for entry notes.
   Notes stay plain text, so drafts, backups, and the website bridge keep the same format.
   The text helpers and parser are pure; renderMarkdown() and createNotebook() need a DOM. */
(function (root) {
  "use strict";

  // --- Counting and stamps ---

  const WORD = /[\p{L}\p{N}]+(?:['’.-][\p{L}\p{N}]+)*/gu;
  const WORDS_PER_MINUTE = 230;
  const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const pad2 = (value) => String(value).padStart(2, "0");

  function textStats(text) {
    const value = String(text ?? "");
    const words = (value.match(WORD) || []).length;
    return { words, characters: value.length, minutes: words ? Math.max(1, Math.round(words / WORDS_PER_MINUTE)) : 0 };
  }

  function formatStats({ words, characters, minutes }) {
    if (!characters) return "Empty note";
    const count = (value, one, many) => `${value.toLocaleString("en-US")} ${value === 1 ? one : many}`;
    const parts = [count(words, "word", "words"), count(characters, "character", "characters")];
    if (minutes) parts.push(`${minutes} min read`);
    return parts.join(" · ");
  }

  // 75 -> "1:15", 3725 -> "1:02:05"
  function formatClock(totalSeconds) {
    const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return h ? `${h}:${pad2(m)}:${pad2(s)}` : `${m}:${pad2(s)}`;
  }

  // "Tue 25 Nov, 14:32" in local time.
  const formatStamp = (date = new Date()) =>
    `${SHORT_DAYS[date.getDay()]} ${date.getDate()} ${SHORT_MONTHS[date.getMonth()]}, ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;

  // --- Editing helpers ---
  // Each helper takes { value, start, end } and returns an edit:
  // { from, to, text, selectionStart, selectionEnd }, or null when it does not apply.

  // Whole lines touched by a selection. A selection ending right after a newline excludes the next line.
  const lineStart = (value, index) => (index > 0 ? value.lastIndexOf("\n", index - 1) + 1 : 0);

  function lineRange(value, start, end) {
    const from = lineStart(value, start);
    let to = end > start && value[end - 1] === "\n" ? end - 1 : value.indexOf("\n", end);
    if (to === -1 || to < from) to = to === -1 ? value.length : from;
    return { from, to };
  }

  const LINE_MARKER = /^(\s*)([-*+]\s+\[[ xX]\]\s+|[-*+]\s+|\d+[.)]\s+|>\s?|#{1,6}\s+)?/;
  const LIST_ITEM = /^(\s*)(?:([-*+])(\s+)(\[[ xX]\]\s+)?|(\d+)([.)])(\s+)|(>)(\s?))/;
  const PREFIXES = { bullet: "- ", task: "- [ ] ", quote: "> ", heading: "## " };

  function markerKind(marker) {
    if (!marker) return null;
    if (/^[-*+]\s+\[/.test(marker)) return "task";
    if (/^[-*+]/.test(marker)) return "bullet";
    if (/^\d/.test(marker)) return "number";
    if (marker.startsWith(">")) return "quote";
    return "heading";
  }

  // Add a line prefix (heading, bullet, number, task, quote) to every selected line,
  // swapping any other prefix, or remove it when every line already has it.
  function toggleLinePrefix(state, kind) {
    const { value, start, end } = state;
    const { from, to } = lineRange(value, start, end);
    const lines = value.slice(from, to).split("\n");
    const parsed = lines.map((line) => {
      const match = LINE_MARKER.exec(line);
      return { line, indent: match[1], marker: match[2] || "", rest: line.slice(match[0].length) };
    });
    const multiLine = lines.length > 1;
    const targets = parsed.filter((item) => !multiLine || item.line.trim());
    const removing = targets.length > 0 && targets.every((item) => markerKind(item.marker) === kind);

    let number = 0;
    const text = parsed.map((item) => {
      if (multiLine && !item.line.trim()) return item.line;
      if (removing) return item.indent + item.rest;
      number += 1;
      return item.indent + (kind === "number" ? `${number}. ` : PREFIXES[kind]) + item.rest;
    }).join("\n");

    if (!multiLine && start === end) {
      const contentStart = from + text.length - parsed[0].rest.length;
      const caret = Math.max(contentStart, start + text.length - (to - from));
      return { from, to, text, selectionStart: caret, selectionEnd: caret };
    }
    return { from, to, text, selectionStart: from, selectionEnd: from + text.length };
  }

  // Wrap the selection in inline markers, or unwrap it when it is already wrapped.
  function wrapSelection(state, before, after, placeholder) {
    const { value, start, end } = state;
    const selected = value.slice(start, end);

    // "**bold**" is not italic: a single marker next to a double one is part of the double one.
    const partOfDouble = before.length === 1
      && value[start - 2] === before && value[end + 1] === after && value[start - 3] !== before;
    if (value.slice(start - before.length, start) === before && value.slice(end, end + after.length) === after && !partOfDouble) {
      return { from: start - before.length, to: end + after.length, text: selected, selectionStart: start - before.length, selectionEnd: end - before.length };
    }
    if (selected.length >= before.length + after.length + 1 && selected.startsWith(before) && selected.endsWith(after)) {
      const inner = selected.slice(before.length, selected.length - after.length);
      return { from: start, to: end, text: inner, selectionStart: start, selectionEnd: start + inner.length };
    }

    if (!selected.trim()) {
      const text = `${before}${placeholder}${after}`;
      return { from: start, to: end, text, selectionStart: start + before.length, selectionEnd: start + before.length + placeholder.length };
    }
    // Keep surrounding spaces outside the markers; "**word **" is not bold.
    const lead = /^\s*/.exec(selected)[0];
    const trail = /\s*$/.exec(selected)[0];
    const core = selected.slice(lead.length, selected.length - trail.length);
    const selectionStart = start + lead.length + before.length;
    return { from: start, to: end, text: `${lead}${before}${core}${after}${trail}`, selectionStart, selectionEnd: selectionStart + core.length };
  }

  function wrapBlock(state, fence) {
    const { value, start, end } = state;
    const { from, to } = lineRange(value, start, end);
    const inner = value.slice(from, to);
    const selectionStart = from + fence.length + 1;
    return { from, to, text: `${fence}\n${inner}\n${fence}`, selectionStart, selectionEnd: selectionStart + inner.length };
  }

  // Enter inside a list item starts the next item. Enter on an empty item outdents it, then ends the list.
  function continueList(state) {
    const { value, start, end } = state;
    if (start !== end) return null;
    const from = lineStart(value, start);
    let to = value.indexOf("\n", start);
    if (to === -1) to = value.length;
    const line = value.slice(from, to);
    const match = LIST_ITEM.exec(line);
    if (!match || start < from + match[0].length) return null;

    const [whole, indent] = match;
    if (!line.slice(whole.length).trim()) {
      if (indent) {
        const text = indent.replace(/^(\t| {1,2})/, "") + whole.slice(indent.length);
        return { from, to, text, selectionStart: from + text.length, selectionEnd: from + text.length };
      }
      return { from, to, text: "", selectionStart: from, selectionEnd: from };
    }

    let marker;
    if (match[2]) marker = `${match[2]}${match[3]}${match[4] ? "[ ] " : ""}`;
    else if (match[5]) marker = `${Number(match[5]) + 1}${match[6]}${match[7]}`;
    else marker = `>${match[9] || " "}`;
    const text = `\n${indent}${marker}`;
    return { from: start, to: start, text, selectionStart: start + text.length, selectionEnd: start + text.length };
  }

  // Tab only indents list items, so it still moves focus everywhere else.
  function isListSelection(state) {
    const { from, to } = lineRange(state.value, state.start, state.end);
    return state.value.slice(from, to).split("\n").every((line) => /^\s*(?:[-*+]|\d+[.)])\s/.test(line));
  }

  function indentLines(state, outdent = false) {
    const { value, start, end } = state;
    const { from, to } = lineRange(value, start, end);
    let firstDelta = 0;
    let totalDelta = 0;
    const text = value.slice(from, to).split("\n").map((line, index) => {
      const next = outdent ? line.replace(/^(\t| {1,2})/, "") : `  ${line}`;
      const delta = next.length - line.length;
      if (index === 0) firstDelta = delta;
      totalDelta += delta;
      return next;
    }).join("\n");
    return { from, to, text, selectionStart: Math.max(from, start + firstDelta), selectionEnd: Math.max(from, end + totalDelta) };
  }

  function insertLink(state) {
    const { value, start, end } = state;
    const selected = value.slice(start, end).trim();
    if (/^https?:\/\/\S+$/.test(selected)) {
      return { from: start, to: end, text: `[link text](${selected})`, selectionStart: start + 1, selectionEnd: start + 10 };
    }
    const label = selected || "link text";
    const urlStart = start + label.length + 3;
    return { from: start, to: end, text: `[${label}](https://)`, selectionStart: urlStart, selectionEnd: urlStart + 8 };
  }

  // Put a block (like a divider) on its own line.
  function insertBlock(state, block) {
    const { value, start, end } = state;
    const lead = start === 0 || value[start - 1] === "\n" ? "" : "\n";
    const text = `${lead}${block}\n`;
    return { from: start, to: end, text, selectionStart: start + text.length, selectionEnd: start + text.length };
  }

  // Insert a token at the caret with a space on either side when needed.
  function insertInline(state, token) {
    const { value, start, end } = state;
    const lead = start > 0 && !/\s/.test(value[start - 1]) ? " " : "";
    const trail = /^\s/.test(value.slice(end, end + 1)) ? "" : " ";
    const text = `${lead}${token}${trail}`;
    return { from: start, to: end, text, selectionStart: start + text.length, selectionEnd: start + text.length };
  }

  // Flip "- [ ]" and "- [x]" on one source line (used by preview checkboxes).
  function toggleTaskLine(value, lineIndex) {
    const lines = value.split("\n");
    const match = /^(\s*[-*+]\s+\[)([ xX])\]/.exec(lines[lineIndex] ?? "");
    if (!match) return value;
    const line = lines[lineIndex];
    lines[lineIndex] = `${match[1]}${match[2] === " " ? "x" : " "}${line.slice(match[1].length + 1)}`;
    return lines.join("\n");
  }

  // --- Markdown ---
  // A small, safe subset: headings, paragraphs, lists, checklists, quotes, code, dividers,
  // bold, italic, strikethrough, inline code, http(s) links, and [12:34] video times.

  const INLINE = new RegExp([
    /`([^`\n]+)`/.source, // 1 code
    /\[(\d{1,2}:\d{2}(?::\d{2})?)\]/.source, // 2 video time
    /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/.source, // 3 text, 4 href
    /(https?:\/\/[^\s<>()]*[^\s<>().,;:!?'"\]])/.source, // 5 bare URL
    /\*\*(?=\S)(.*?\S)\*\*/.source, // 6 bold
    /__(?=\S)(.*?\S)__/.source, // 7 bold
    /~~(?=\S)(.*?\S)~~/.source, // 8 strikethrough
    /\*(?=[^\s*])(.*?[^\s*])\*/.source, // 9 italic
    /(?<![\p{L}\p{N}_])_(?=[^\s_])(.*?[^\s_])_(?![\p{L}\p{N}_])/.source, // 10 italic, not inside snake_case
  ].join("|"), "gu");

  function parseInline(text, allowLinks = true) {
    const nodes = [];
    let last = 0;
    // matchAll works on a copy of the regex, so the recursive calls below are safe.
    for (const match of text.matchAll(INLINE)) {
      if (match.index > last) nodes.push({ type: "text", text: text.slice(last, match.index) });
      const [whole, code, time, label, href, bare, bold1, bold2, strike, em1, em2] = match;
      if (code !== undefined) nodes.push({ type: "code", text: code });
      else if (time !== undefined) nodes.push({ type: "time", text: time });
      else if (label !== undefined) {
        nodes.push(allowLinks ? { type: "link", href, children: parseInline(label, false) } : { type: "text", text: whole });
      } else if (bare !== undefined) {
        nodes.push(allowLinks ? { type: "link", href: bare, children: [{ type: "text", text: bare }] } : { type: "text", text: whole });
      } else if ((bold1 ?? bold2) !== undefined) nodes.push({ type: "strong", children: parseInline(bold1 ?? bold2, allowLinks) });
      else if (strike !== undefined) nodes.push({ type: "del", children: parseInline(strike, allowLinks) });
      else nodes.push({ type: "em", children: parseInline(em1 ?? em2, allowLinks) });
      last = match.index + whole.length;
    }
    if (last < text.length) nodes.push({ type: "text", text: text.slice(last) });
    return nodes;
  }

  function parseMarkdown(source) {
    const lines = String(source ?? "").replace(/\r\n?/g, "\n").split("\n");
    const blocks = [];
    let paragraph = null;
    let list = null;
    let quote = null;
    const reset = () => { paragraph = list = quote = null; };

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      let match;

      if ((match = /^\s*(```|~~~)/.exec(line))) {
        const body = [];
        while (++index < lines.length && !lines[index].trimStart().startsWith(match[1])) body.push(lines[index]);
        blocks.push({ type: "code", text: body.join("\n") });
        reset();
      } else if (!line.trim()) {
        reset();
      } else if ((match = /^\s{0,3}(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/.exec(line))) {
        blocks.push({ type: "heading", level: match[1].length, content: parseInline(match[2]) });
        reset();
      } else if (/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
        blocks.push({ type: "hr" });
        reset();
      } else if ((match = /^(\s*)([-*+]|\d+[.)])\s+(?:\[([ xX])\](?:\s+|$))?(.*)$/.exec(line))) {
        const ordered = /\d/.test(match[2]);
        if (!list || list.ordered !== ordered) {
          list = { type: "list", ordered, items: [] };
          blocks.push(list);
        }
        paragraph = quote = null;
        list.items.push({
          depth: Math.min(Math.floor(match[1].replace(/\t/g, "  ").length / 2), 4),
          number: ordered ? Number.parseInt(match[2], 10) : null,
          checked: match[3] === undefined ? null : match[3] !== " ",
          line: index,
          content: parseInline(match[4]),
        });
      } else if ((match = /^\s{0,3}>\s?(.*)$/.exec(line))) {
        if (!quote) {
          quote = { type: "quote", lines: [] };
          blocks.push(quote);
        }
        paragraph = list = null;
        quote.lines.push(parseInline(match[1]));
      } else {
        if (!paragraph) {
          paragraph = { type: "paragraph", lines: [] };
          blocks.push(paragraph);
        }
        list = quote = null;
        paragraph.lines.push(parseInline(line.trim()));
      }
    }
    return blocks;
  }

  function safeHref(href) {
    try {
      const url = new URL(href);
      return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
    } catch {
      return null;
    }
  }

  // Builds DOM nodes directly; note text is never parsed as HTML.
  function appendInline(parent, nodes, doc) {
    for (const node of nodes) {
      if (node.type === "text") {
        parent.append(node.text);
      } else if (node.type === "code" || node.type === "time") {
        const element = doc.createElement(node.type === "code" ? "code" : "span");
        if (node.type === "time") element.className = "md-time";
        element.textContent = node.text;
        parent.append(element);
      } else if (node.type === "link") {
        const href = safeHref(node.href);
        if (!href) {
          appendInline(parent, node.children, doc);
          continue;
        }
        const link = doc.createElement("a");
        link.href = href;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        appendInline(link, node.children, doc);
        parent.append(link);
      } else {
        const element = doc.createElement(node.type);
        appendInline(element, node.children, doc);
        parent.append(element);
      }
    }
  }

  function appendLines(parent, lines, doc) {
    lines.forEach((line, index) => {
      if (index) parent.append(doc.createElement("br"));
      appendInline(parent, line, doc);
    });
  }

  function renderBlock(block, doc, interactiveTasks) {
    if (block.type === "heading") {
      const heading = doc.createElement(`h${block.level}`);
      appendInline(heading, block.content, doc);
      return heading;
    }
    if (block.type === "paragraph" || block.type === "quote") {
      const paragraph = doc.createElement("p");
      appendLines(paragraph, block.lines, doc);
      if (block.type === "paragraph") return paragraph;
      const quote = doc.createElement("blockquote");
      quote.append(paragraph);
      return quote;
    }
    if (block.type === "code") {
      const pre = doc.createElement("pre");
      const code = doc.createElement("code");
      code.textContent = block.text;
      pre.append(code);
      return pre;
    }
    if (block.type === "hr") return doc.createElement("hr");

    const list = doc.createElement(block.ordered ? "ol" : "ul");
    for (const item of block.items) {
      const li = doc.createElement("li");
      if (item.depth) li.dataset.depth = String(item.depth);
      if (item.number !== null) li.value = item.number;
      if (item.checked !== null) {
        li.className = "md-task";
        const box = doc.createElement("input");
        box.type = "checkbox";
        box.checked = item.checked;
        box.disabled = !interactiveTasks;
        box.dataset.line = String(item.line);
        li.append(box);
      }
      appendInline(li, item.content, doc);
      list.append(li);
    }
    return list;
  }

  function renderMarkdown(source, { document: doc = root.document, interactiveTasks = false } = {}) {
    const fragment = doc.createDocumentFragment();
    for (const block of parseMarkdown(source)) fragment.append(renderBlock(block, doc, interactiveTasks));
    return fragment;
  }

  // --- Editor controller ---

  const VIEWS = ["write", "split", "preview"];
  const FONTS = ["serif", "sans", "mono"];
  const FONT_LABELS = { serif: "Serif", sans: "Sans", mono: "Mono" };
  const SAVE_TEXT = { idle: "", saving: "Saving…", saved: "Saved", error: "Couldn't save" };

  function readPref(key, allowed, fallback) {
    try {
      const value = localStorage.getItem(key);
      return allowed.includes(value) ? value : fallback;
    } catch {
      return fallback;
    }
  }

  function writePref(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {}
  }

  const COMMANDS = {
    heading: (s) => toggleLinePrefix(s, "heading"),
    bold: (s) => wrapSelection(s, "**", "**", "bold text"),
    italic: (s) => wrapSelection(s, "*", "*", "italic text"),
    strike: (s) => wrapSelection(s, "~~", "~~", "struck text"),
    bullet: (s) => toggleLinePrefix(s, "bullet"),
    number: (s) => toggleLinePrefix(s, "number"),
    task: (s) => toggleLinePrefix(s, "task"),
    quote: (s) => toggleLinePrefix(s, "quote"),
    code: (s) => (s.value.slice(s.start, s.end).includes("\n") ? wrapBlock(s, "```") : wrapSelection(s, "`", "`", "code")),
    link: insertLink,
    divider: (s) => insertBlock(s, "---"),
    now: (s) => insertInline(s, `**${formatStamp()}**`),
  };
  const SHORTCUTS = { b: "bold", i: "italic", k: "link" };

  // Replace text through the browser's editing commands so Cmd+Z still works, with a plain fallback.
  function applyEdit(textarea, edit) {
    const expected = textarea.value.slice(0, edit.from) + edit.text + textarea.value.slice(edit.to);
    textarea.focus();
    textarea.setSelectionRange(edit.from, edit.to);
    let inserted = false;
    try {
      inserted = textarea.ownerDocument.execCommand("insertText", false, edit.text);
    } catch {}
    if (!inserted || textarea.value !== expected) {
      textarea.value = expected;
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    }
    textarea.setSelectionRange(edit.selectionStart, edit.selectionEnd);
  }

  /**
   * Wire the notebook markup inside `rootEl`. Call open() with:
   *   value, title, onInput(value), and optionally onClose(value), onPopOut(), getVideoTime(), onSaveNow().
   * Buttons for optional actions are hidden when the action is missing.
   */
  function createNotebook(rootEl) {
    const editor = rootEl.querySelector(".nb-editor");
    const preview = rootEl.querySelector(".nb-preview");
    const body = rootEl.querySelector(".nb-body");
    const titleEl = rootEl.querySelector(".nb-title");
    const saveEl = rootEl.querySelector(".nb-save");
    const statsEl = rootEl.querySelector(".nb-stats");
    const fontLabel = rootEl.querySelector(".nb-font-label");
    const doc = rootEl.ownerDocument;
    preview.tabIndex = -1; // Preview takes focus when the editor is hidden, so keys still reach the notebook.

    let session = null;
    let view = readPref("notebookView", VIEWS, "write");
    let font = readPref("notebookFont", FONTS, "serif");
    let frame = 0;
    let renderedSource = null;
    let saveState = { state: "idle", text: "" };
    let flashTimer = 0;

    const selection = () => ({ value: editor.value, start: editor.selectionStart, end: editor.selectionEnd });

    function showSave(state, text) {
      saveEl.dataset.state = state;
      saveEl.textContent = text;
    }

    function setSaveState(state, text = SAVE_TEXT[state] ?? "") {
      saveState = { state, text };
      if (!flashTimer) showSave(state, text);
    }

    function flash(text, state = "info") {
      clearTimeout(flashTimer);
      showSave(state, text);
      flashTimer = setTimeout(() => {
        flashTimer = 0;
        showSave(saveState.state, saveState.text);
      }, 2500);
    }

    function applyPrefs() {
      rootEl.dataset.font = font;
      if (fontLabel) fontLabel.textContent = FONT_LABELS[font];
      body.dataset.view = view;
      for (const button of rootEl.querySelectorAll("[data-view]")) {
        button.setAttribute("aria-pressed", String(button.dataset.view === view));
      }
    }

    // Stats and preview update at most once per frame, however fast you type.
    function refresh() {
      frame = 0;
      statsEl.textContent = formatStats(textStats(editor.value));
      if (view === "write" || renderedSource === editor.value) return;
      renderedSource = editor.value;
      if (renderedSource.trim()) {
        preview.replaceChildren(renderMarkdown(renderedSource, { document: doc, interactiveTasks: true }));
      } else {
        const empty = doc.createElement("p");
        empty.className = "nb-empty";
        empty.textContent = "Nothing to preview yet.";
        preview.replaceChildren(empty);
      }
    }

    function scheduleRefresh() {
      if (!frame) frame = requestAnimationFrame(refresh);
    }

    function apply(edit) {
      if (!edit || editor.readOnly) return false;
      applyEdit(editor, edit);
      return true;
    }

    function focusView() {
      if (view === "preview") preview.focus({ preventScroll: true });
      else editor.focus({ preventScroll: true });
    }

    function setView(next) {
      view = next;
      writePref("notebookView", view);
      applyPrefs();
      refresh();
      focusView();
    }

    function cycleFont() {
      font = FONTS[(FONTS.indexOf(font) + 1) % FONTS.length];
      writePref("notebookFont", font);
      applyPrefs();
    }

    async function insertVideoTime() {
      if (!session?.getVideoTime) return;
      flash("Reading the video…");
      try {
        const seconds = await session.getVideoTime();
        if (seconds === null || seconds === undefined) {
          flash("No video found on that tab", "error");
          return;
        }
        apply(insertInline(selection(), `[${formatClock(seconds)}]`));
        flash(`Added ${formatClock(seconds)}`);
      } catch {
        flash("Couldn't read that tab's video", "error");
      }
    }

    function run(command) {
      if (command === "font") {
        cycleFont();
        return;
      }
      // Formatting needs the editor on screen.
      if (view === "preview") setView("write");
      if (command === "video-time") insertVideoTime();
      else if (COMMANDS[command]) apply(COMMANDS[command](selection()));
    }

    function close() {
      if (!session) return;
      const ended = session;
      session = null;
      rootEl.hidden = true;
      ended.onClose?.(editor.value);
    }

    function focusEnd() {
      editor.setSelectionRange(editor.value.length, editor.value.length);
      editor.scrollTop = editor.scrollHeight;
      focusView();
    }

    editor.addEventListener("input", () => {
      session?.onInput?.(editor.value);
      scheduleRefresh();
    });

    editor.addEventListener("keydown", (event) => {
      if (event.isComposing || event.keyCode === 229) return; // Leave IME input (Japanese, etc.) alone.
      const mod = event.metaKey || event.ctrlKey;
      if (event.key === "Enter" && !mod && !event.shiftKey && !event.altKey) {
        if (apply(continueList(selection()))) event.preventDefault();
      } else if (event.key === "Tab" && !mod && !event.altKey && isListSelection(selection())) {
        event.preventDefault();
        apply(indentLines(selection(), event.shiftKey));
      } else if (mod && !event.altKey) {
        const key = event.key.toLowerCase();
        const command = event.shiftKey ? (key === "x" ? "strike" : null) : SHORTCUTS[key];
        if (command) {
          event.preventDefault();
          run(command);
        } else if (key === "s") {
          event.preventDefault();
          session?.onSaveNow?.();
        }
      }
    });

    // Esc or Cmd/Ctrl+Enter returns to the form from anywhere while the popup notebook is open.
    doc.addEventListener("keydown", (event) => {
      if (!session?.onClose || rootEl.hidden || event.defaultPrevented || event.isComposing) return;
      if (event.key === "Escape" || (event.key === "Enter" && (event.metaKey || event.ctrlKey))) {
        event.preventDefault();
        close();
      }
    });

    rootEl.addEventListener("click", (event) => {
      const box = event.target.closest("input[type=checkbox][data-line]");
      if (box && preview.contains(box)) {
        if (editor.readOnly) {
          event.preventDefault();
          return;
        }
        const next = toggleTaskLine(editor.value, Number(box.dataset.line));
        if (next !== editor.value) {
          editor.value = next;
          editor.dispatchEvent(new Event("input", { bubbles: true }));
        }
        return;
      }
      const button = event.target.closest("button");
      if (!button || !rootEl.contains(button)) return;
      if (button.dataset.cmd) run(button.dataset.cmd);
      else if (button.dataset.view) setView(button.dataset.view);
      else if (button.dataset.nb === "close") close();
      else if (button.dataset.nb === "popout") session?.onPopOut?.(editor.value);
    });

    return {
      open(options) {
        session = options;
        titleEl.textContent = options.title || "Untitled entry";
        for (const [selector, enabled] of [
          ['[data-nb="close"]', options.onClose],
          ['[data-nb="popout"]', options.onPopOut],
          ['[data-cmd="video-time"]', options.getVideoTime],
        ]) {
          for (const element of rootEl.querySelectorAll(selector)) element.hidden = !enabled;
        }
        editor.value = options.value || "";
        editor.readOnly = false;
        rootEl.classList.remove("is-readonly");
        renderedSource = null;
        setSaveState(options.saveState || "idle", options.saveText);
        applyPrefs();
        rootEl.hidden = false;
        refresh();
        focusEnd();
      },
      close,
      setValue(value) {
        if (editor.value === value) return;
        editor.value = value;
        scheduleRefresh();
      },
      setTitle(title) {
        titleEl.textContent = title || "Untitled entry";
      },
      // Leave the text visible but stop all editing, e.g. once the entry has been added.
      setReadOnly(readOnly) {
        editor.readOnly = readOnly;
        rootEl.classList.toggle("is-readonly", readOnly);
      },
      setSaveState,
      flash,
      get isOpen() {
        return session !== null;
      },
    };
  }

  root.MediaLogNotebook = Object.freeze({
    textStats, formatStats, formatClock, formatStamp,
    toggleLinePrefix, wrapSelection, wrapBlock, continueList, isListSelection, indentLines,
    insertLink, insertBlock, insertInline, toggleTaskLine,
    parseInline, parseMarkdown, renderMarkdown, createNotebook,
  });
})(globalThis);
