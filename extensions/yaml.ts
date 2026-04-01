/**
 * Minimal YAML parser for gitagent agent.yaml files.
 *
 * Handles the subset of YAML used by the gitagent spec:
 * scalars, sequences, mappings, and nested structures.
 * No anchors, aliases, tags, multiline blocks, or flow collections needed.
 *
 * Good enough for agent.yaml and knowledge/index.yaml. Not a general YAML parser.
 */

type YamlValue = string | number | boolean | null | YamlValue[] | { [key: string]: YamlValue };

export function parseYaml(text: string): YamlValue {
  const lines = text.split("\n");
  const { value } = parseBlock(lines, 0, -1);
  return value;
}

interface ParseResult {
  value: YamlValue;
  nextLine: number;
}

function getIndent(line: string): number {
  const match = line.match(/^( *)/);
  return match ? match[1].length : 0;
}

function isBlankOrComment(line: string): boolean {
  const trimmed = line.trim();
  return trimmed === "" || trimmed.startsWith("#");
}

function parseScalar(raw: string): YamlValue {
  const trimmed = raw.trim();

  if (trimmed === "" || trimmed === "null" || trimmed === "~") return null;
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;

  // Quoted string
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }

  // Number
  const num = Number(trimmed);
  if (!isNaN(num) && trimmed !== "") return num;

  // Bare string
  return trimmed;
}

function parseBlock(lines: string[], startLine: number, parentIndent: number): ParseResult {
  let i = startLine;

  // Skip blanks/comments
  while (i < lines.length && isBlankOrComment(lines[i])) i++;
  if (i >= lines.length) return { value: null, nextLine: i };

  const firstIndent = getIndent(lines[i]);
  if (firstIndent <= parentIndent && parentIndent >= 0) {
    return { value: null, nextLine: i };
  }

  // Detect if this block is a sequence (starts with "- ")
  const firstContent = lines[i].trim();
  if (firstContent.startsWith("- ")) {
    return parseSequence(lines, i, firstIndent);
  }

  // Otherwise it's a mapping
  return parseMapping(lines, i, firstIndent);
}

function parseSequence(lines: string[], startLine: number, blockIndent: number): ParseResult {
  const result: YamlValue[] = [];
  let i = startLine;

  while (i < lines.length) {
    while (i < lines.length && isBlankOrComment(lines[i])) i++;
    if (i >= lines.length) break;

    const indent = getIndent(lines[i]);
    if (indent < blockIndent) break;
    if (indent !== blockIndent) break;

    const content = lines[i].trim();
    if (!content.startsWith("- ")) break;

    const afterDash = content.slice(2).trim();

    // "- key: value" (inline mapping item)
    if (afterDash.includes(": ") || afterDash.endsWith(":")) {
      // Could be a mapping entry. Check if next lines are indented further.
      const colonIdx = afterDash.indexOf(":");
      const key = afterDash.slice(0, colonIdx).trim();
      const valStr = afterDash.slice(colonIdx + 1).trim();

      if (valStr) {
        // Simple "- key: value"
        const obj: Record<string, YamlValue> = {};
        obj[key] = parseScalar(valStr);

        // Check for more keys at deeper indent
        i++;
        const itemIndent = blockIndent + 2;
        while (i < lines.length) {
          while (i < lines.length && isBlankOrComment(lines[i])) i++;
          if (i >= lines.length) break;
          if (getIndent(lines[i]) < itemIndent) break;

          const subContent = lines[i].trim();
          const subColon = subContent.indexOf(":");
          if (subColon > 0) {
            const subKey = subContent.slice(0, subColon).trim();
            const subVal = subContent.slice(subColon + 1).trim();
            obj[subKey] = subVal ? parseScalar(subVal) : null;
          }
          i++;
        }
        result.push(obj);
      } else {
        // "- key:" with nested value
        i++;
        const { value: nested, nextLine } = parseBlock(lines, i, blockIndent + 2);
        const obj: Record<string, YamlValue> = {};
        obj[key] = nested;
        result.push(obj);
        i = nextLine;
      }
    } else if (afterDash.startsWith("[") && afterDash.endsWith("]")) {
      // Inline flow sequence: - [a, b]
      const inner = afterDash.slice(1, -1);
      result.push(inner.split(",").map((s) => parseScalar(s.trim())));
      i++;
    } else {
      // Simple scalar item: - value
      result.push(parseScalar(afterDash));
      i++;
    }
  }

  return { value: result, nextLine: i };
}

function parseMapping(lines: string[], startLine: number, blockIndent: number): ParseResult {
  const result: Record<string, YamlValue> = {};
  let i = startLine;

  while (i < lines.length) {
    while (i < lines.length && isBlankOrComment(lines[i])) i++;
    if (i >= lines.length) break;

    const indent = getIndent(lines[i]);
    if (indent < blockIndent) break;
    if (indent !== blockIndent) { i++; continue; }

    const content = lines[i].trim();

    // Skip sequence items at this level (shouldn't happen in well-formed mapping)
    if (content.startsWith("- ")) break;

    const colonIdx = content.indexOf(":");
    if (colonIdx < 0) { i++; continue; }

    const key = content.slice(0, colonIdx).trim();
    const valStr = content.slice(colonIdx + 1).trim();

    if (valStr) {
      // Inline flow sequence: key: [a, b, c]
      if (valStr.startsWith("[") && valStr.endsWith("]")) {
        const inner = valStr.slice(1, -1);
        result[key] = inner ? inner.split(",").map((s) => parseScalar(s.trim())) : [];
      } else {
        result[key] = parseScalar(valStr);
      }
      i++;
    } else {
      // Value on next line(s), indented deeper
      i++;
      const { value: nested, nextLine } = parseBlock(lines, i, blockIndent);
      result[key] = nested;
      i = nextLine;
    }
  }

  return { value: result, nextLine: i };
}
