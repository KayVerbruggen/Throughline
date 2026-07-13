import yaml from "js-yaml";

export interface RawArtifact {
  data: Record<string, unknown>;
  body: string;
}

const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/** Split a "YAML frontmatter + markdown body" file into its two parts. */
export function splitFrontmatter(raw: string): RawArtifact {
  const text = raw.replace(/^﻿/, ""); // strip BOM
  const m = text.match(FM_RE);
  if (!m) {
    // No frontmatter block — treat the whole thing as body.
    return { data: {}, body: text.trim() };
  }
  const data = (yaml.load(m[1]) as Record<string, unknown> | null) ?? {};
  return { data, body: m[2].replace(/^\r?\n/, "").trimEnd() };
}

/** Build a file from a frontmatter object and a markdown body. */
export function buildFile(data: Record<string, unknown>, body: string): string {
  const fm = yaml
    .dump(data, { lineWidth: 100, noRefs: true, quotingType: '"' })
    .trimEnd();
  const trimmedBody = body.trim();
  if (!trimmedBody) return `---\n${fm}\n---\n`;
  return `---\n${fm}\n---\n\n${trimmedBody}\n`;
}
