/**
 * Minimal markdown → React renderer for the Ratchet guide pack.
 *
 * The site has no markdown dependency and the mission forbids adding one, so
 * this covers exactly the subset of markdown the sanitized pack uses:
 * headings (with GitHub-style slug ids), paragraphs, fenced code blocks,
 * pipe tables, ordered/unordered lists (including `- [ ]` checkboxes and
 * indented continuation blocks inside list items), horizontal rules, and the
 * inline forms `code`, **bold**, _italic_ / *italic*, and [links](href).
 * Rendering produces React nodes, so all text is escaped by React itself.
 */
import type { ReactNode } from "react";

export type MarkdownRenderOptions = {
  /** Map a source href (e.g. "./architecture.md") to a public URL. */
  resolveHref?: (href: string) => string;
};

type Ctx = {
  resolve: (href: string) => string;
  ids: Set<string>;
};

/** lines[i] with a defined fallback — the parsers bounds-check before reading. */
function at(lines: string[], i: number): string {
  return lines[i] ?? "";
}

/** GitHub-style heading slug: lowercase, punctuation dropped, spaces → hyphens. */
function slugify(text: string, ids: Set<string>): string {
  const base =
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, "")
      .trim()
      .replace(/\s+/g, "-") || "section";
  let slug = base;
  let n = 1;
  while (ids.has(slug)) {
    slug = `${base}-${n}`;
    n += 1;
  }
  ids.add(slug);
  return slug;
}

function isFence(line: string): RegExpMatchArray | null {
  return line.match(/^```(\S*)\s*$/);
}

function isHr(line: string): boolean {
  return /^\s*(---+|\*\*\*+|___+)\s*$/.test(line);
}

function isHeading(line: string): RegExpMatchArray | null {
  return line.match(/^(#{1,6})\s+(.*)$/);
}

type ListMarker = { indent: number; ordered: boolean; number: number; width: number; text: string };

function matchListItem(line: string): ListMarker | null {
  const m = line.match(/^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/);
  if (!m) return null;
  const indent = m[1] ?? "";
  const marker = m[2] ?? "";
  const ordered = /\d/.test(marker);
  return {
    indent: indent.length,
    ordered,
    number: ordered ? parseInt(marker, 10) : 0,
    width: indent.length + marker.length + 1,
    text: m[3] ?? "",
  };
}

function leadingSpaces(line: string): number {
  return line.length - line.trimStart().length;
}

function splitTableRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  const cells: string[] = [];
  let cur = "";
  let inCode = false;
  for (const ch of s) {
    if (ch === "`") inCode = !inCode;
    if (ch === "|" && !inCode) {
      cells.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  cells.push(cur.trim());
  return cells;
}

function isTableSeparator(line: string): boolean {
  const cells = splitTableRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function isTableStart(lines: string[], i: number): boolean {
  return at(lines, i).trim().startsWith("|") && isTableSeparator(at(lines, i + 1));
}

/** Does this line start a new block (used to bound paragraphs)? */
function isBlockStart(lines: string[], i: number): boolean {
  const line = at(lines, i);
  return Boolean(
    isFence(line) || isHeading(line) || isHr(line) || matchListItem(line) || isTableStart(lines, i),
  );
}

function renderInline(text: string, ctx: Ctx, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  let buf = "";
  let i = 0;
  let n = 0;
  const flush = () => {
    if (buf) {
      out.push(buf);
      buf = "";
    }
  };
  while (i < text.length) {
    const ch = text[i] ?? "";
    if (ch === "`") {
      const end = text.indexOf("`", i + 1);
      if (end > i + 1) {
        flush();
        out.push(
          <code
            key={`${keyPrefix}c${n++}`}
            className="rounded border border-border bg-surface px-1 py-0.5 font-mono text-[0.85em] text-ink"
          >
            {text.slice(i + 1, end)}
          </code>,
        );
        i = end + 1;
        continue;
      }
    } else if (ch === "[") {
      const close = text.indexOf("]", i + 1);
      if (close !== -1 && (text[close + 1] ?? "") === "(") {
        const pEnd = text.indexOf(")", close + 2);
        if (pEnd > close + 2) {
          flush();
          const label = text.slice(i + 1, close);
          const href = ctx.resolve(text.slice(close + 2, pEnd).trim());
          const external = /^https?:\/\//.test(href);
          out.push(
            <a
              key={`${keyPrefix}a${n++}`}
              href={href}
              className="font-medium text-purple underline decoration-purple/30 underline-offset-2 hover:decoration-purple"
              {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
            >
              {renderInline(label, ctx, `${keyPrefix}a${n}i`)}
            </a>,
          );
          i = pEnd + 1;
          continue;
        }
      }
    } else if (ch === "*" && (text[i + 1] ?? "") === "*") {
      const end = text.indexOf("**", i + 2);
      if (end > i + 2) {
        flush();
        out.push(
          <strong key={`${keyPrefix}s${n++}`} className="font-semibold text-ink">
            {renderInline(text.slice(i + 2, end), ctx, `${keyPrefix}s${n}i`)}
          </strong>,
        );
        i = end + 2;
        continue;
      }
    } else if (ch === "_" || ch === "*") {
      const before = i === 0 ? " " : (text[i - 1] ?? " ");
      const after = text[i + 1] ?? " ";
      const canOpen = !/[\p{L}\p{N}]/u.test(before) && !/\s/.test(after) && after !== ch;
      if (canOpen) {
        let j = i + 1;
        let end = -1;
        while ((j = text.indexOf(ch, j)) !== -1) {
          const b = text[j - 1] ?? " ";
          const a = text[j + 1] ?? " ";
          if (!/\s/.test(b) && !/[\p{L}\p{N}]/u.test(a) && b !== ch) {
            end = j;
            break;
          }
          j += 1;
        }
        if (end > i + 1) {
          flush();
          out.push(
            <em key={`${keyPrefix}e${n++}`}>
              {renderInline(text.slice(i + 1, end), ctx, `${keyPrefix}e${n}i`)}
            </em>,
          );
          i = end + 1;
          continue;
        }
      }
    }
    buf += ch;
    i += 1;
  }
  flush();
  return out;
}

function renderListItem(lines: string[], ctx: Ctx, keyPrefix: string): ReactNode {
  const checkbox = at(lines, 0).match(/^\[( |x|X)\]\s+(.*)$/);
  if (checkbox && lines.length === 1) {
    return (
      <li key={keyPrefix} className="flex items-start gap-2">
        <input
          type="checkbox"
          disabled
          readOnly
          checked={(checkbox[1] ?? " ") !== " "}
          className="mt-1.5 h-4 w-4 shrink-0 accent-green"
        />
        <span>{renderInline(checkbox[2] ?? "", ctx, `${keyPrefix}c`)}</span>
      </li>
    );
  }
  const simple =
    lines.length > 0 &&
    lines.every((line) => line.trim().length > 0) &&
    !lines.some((line, idx) => idx > 0 && isBlockStart(lines, idx));
  if (simple) {
    return (
      <li key={keyPrefix} className="pl-1">
        {renderInline(lines.join(" "), ctx, `${keyPrefix}p`)}
      </li>
    );
  }
  return (
    <li key={keyPrefix} className="pl-1 [&>:first-child]:mt-0">
      {parseBlocks(lines, ctx, `${keyPrefix}b`)}
    </li>
  );
}

function parseList(
  lines: string[],
  start: number,
  ctx: Ctx,
  keyPrefix: string,
): { node: ReactNode; next: number } {
  const first = matchListItem(at(lines, start));
  if (!first) throw new Error("parseList called on a non-list line");
  const baseIndent = first.indent;
  const ordered = first.ordered;
  const startNumber = first.number;
  const items: { lines: string[]; contentIndent: number }[] = [];
  let i = start;
  while (i < lines.length) {
    const line = at(lines, i);
    const m = matchListItem(line);
    if (m && m.indent === baseIndent && m.ordered === ordered) {
      items.push({ lines: [m.text], contentIndent: m.width });
      i += 1;
      continue;
    }
    const cur = items[items.length - 1];
    if (cur) {
      if (!line.trim()) {
        // A blank line belongs to the list only when the following line
        // continues an item (indented) or starts the next one.
        const next = lines[i + 1];
        if (next !== undefined && next.trim()) {
          const nm = matchListItem(next);
          if ((nm && nm.indent === baseIndent) || (!nm && leadingSpaces(next) > baseIndent)) {
            cur.lines.push("");
            i += 1;
            continue;
          }
        }
        break;
      }
      const indent = leadingSpaces(line);
      if (indent > baseIndent) {
        cur.lines.push(line.slice(Math.min(indent, cur.contentIndent)));
        i += 1;
        continue;
      }
    }
    break;
  }
  const Tag = ordered ? "ol" : "ul";
  const node = (
    <Tag
      key={keyPrefix}
      start={ordered && startNumber !== 1 ? startNumber : undefined}
      className={`mt-4 space-y-2 pl-6 text-ink-soft marker:text-muted ${
        ordered ? "list-decimal" : "list-disc"
      }`}
    >
      {items.map((item, idx) => renderListItem(item.lines, ctx, `${keyPrefix}i${idx}`))}
    </Tag>
  );
  return { node, next: i };
}

const headingClasses: Record<number, string> = {
  1: "mt-8 font-display text-3xl font-bold",
  2: "mt-10 font-display text-2xl font-bold",
  3: "mt-8 font-display text-xl font-semibold",
  4: "mt-6 font-display text-lg font-semibold",
  5: "mt-6 font-display text-base font-semibold",
  6: "mt-6 font-display text-base font-semibold",
};

function parseBlocks(lines: string[], ctx: Ctx, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  let i = 0;
  let n = 0;
  const key = () => `${keyPrefix}${n++}`;
  while (i < lines.length) {
    const line = at(lines, i);
    if (!line.trim()) {
      i += 1;
      continue;
    }
    const fence = isFence(line);
    if (fence) {
      const lang = fence[1] || "";
      const buf: string[] = [];
      i += 1;
      while (i < lines.length && !isFence(at(lines, i))) {
        buf.push(at(lines, i));
        i += 1;
      }
      i += 1; // closing fence
      out.push(
        <pre
          key={key()}
          data-language={lang || undefined}
          className="mt-4 overflow-x-auto rounded-card border border-border bg-surface p-4 text-sm leading-relaxed"
        >
          <code className="font-mono text-ink-soft">{buf.join("\n")}</code>
        </pre>,
      );
      continue;
    }
    const heading = isHeading(line);
    if (heading) {
      const level = (heading[1] ?? "#").length;
      const text = (heading[2] ?? "").trim();
      const id = slugify(text, ctx.ids);
      const Tag = `h${Math.min(level, 6)}` as "h2";
      out.push(
        <Tag key={key()} id={id} className={headingClasses[level] ?? headingClasses[6]}>
          {renderInline(text, ctx, `${keyPrefix}h${n}i`)}
        </Tag>,
      );
      i += 1;
      continue;
    }
    if (isHr(line)) {
      out.push(<hr key={key()} className="my-8 border-t border-border" />);
      i += 1;
      continue;
    }
    if (isTableStart(lines, i)) {
      const headers = splitTableRow(line);
      i += 2; // header + separator
      const rows: string[][] = [];
      while (i < lines.length && at(lines, i).trim().startsWith("|")) {
        const cells = splitTableRow(at(lines, i));
        while (cells.length < headers.length) cells.push("");
        rows.push(cells.slice(0, headers.length));
        i += 1;
      }
      out.push(
        <div key={key()} className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-sm text-ink-soft">
            <thead>
              <tr>
                {headers.map((cell, idx) => (
                  <th
                    key={`${keyPrefix}th${idx}`}
                    className="border border-border bg-surface px-3 py-2 text-left font-display font-semibold text-ink"
                  >
                    {renderInline(cell, ctx, `${keyPrefix}th${idx}i`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, r) => (
                <tr key={`${keyPrefix}tr${r}`}>
                  {row.map((cell, c) => (
                    <td
                      key={`${keyPrefix}td${r}-${c}`}
                      className="border border-border px-3 py-2 align-top"
                    >
                      {renderInline(cell, ctx, `${keyPrefix}td${r}-${c}i`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (matchListItem(line)) {
      const { node, next } = parseList(lines, i, ctx, key());
      out.push(node);
      i = next;
      continue;
    }
    // Paragraph: gather until a blank line or the start of another block.
    const buf: string[] = [];
    while (i < lines.length && at(lines, i).trim() && !(buf.length > 0 && isBlockStart(lines, i))) {
      buf.push(at(lines, i));
      i += 1;
    }
    out.push(
      <p key={key()} className="mt-4 text-ink-soft">
        {renderInline(buf.join(" "), ctx, `${keyPrefix}p${n}i`)}
      </p>,
    );
  }
  return out;
}

/** Render a markdown document to React nodes. */
export function renderMarkdown(markdown: string, options: MarkdownRenderOptions = {}): ReactNode[] {
  const ctx: Ctx = { resolve: options.resolveHref ?? ((href) => href), ids: new Set() };
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  return parseBlocks(lines, ctx, "b");
}

/** Text of the document's leading `# …` H1, if present. */
export function extractLeadingH1(markdown: string): string | null {
  const m = markdown.match(/^#\s+(.*)$/m);
  return m ? (m[1] ?? "").trim() : null;
}

/** The document with its leading `# …` H1 line removed (rendered as page H1 instead). */
export function stripLeadingH1(markdown: string): string {
  return markdown.replace(/^#\s+.*(\r?\n)?/, "");
}
