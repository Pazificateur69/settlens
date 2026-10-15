import { escape } from "./html.js";

// Deliberately small tokenizers: escape everything, then wrap a few token kinds in spans.
// Unknown languages render as escaped plain text.
const GRAMMARS = {
  shell:
    /(?<comment>(?:^|(?<=\s))#.*$)|(?<string>"(?:[^"\\\n]|\\.)*"|'[^'\n]*')|(?<variable>\$\{[^}\n]+\}|\$[A-Za-z_]\w*)|(?<flag>(?<=\s)--?[A-Za-z][\w-]*)/gm,
  json: /(?<key>"(?:[^"\\\n]|\\.)*"(?=\s*:))|(?<string>"(?:[^"\\\n]|\\.)*")|(?<number>-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|(?<keyword>\b(?:true|false|null)\b)/g,
  yaml: /(?<comment>(?:^|(?<=\s))#.*$)|(?<key>^[ \t-]*[\w.-]+(?=:(?:\s|$)))|(?<string>"(?:[^"\\\n]|\\.)*"|'[^'\n]*')|(?<keyword>\b(?:true|false|null)\b)/gm,
};

const ALIASES = { bash: "shell", sh: "shell", console: "shell", yml: "yaml" };

export const LANGUAGE_LABELS = {
  shell: "Shell",
  json: "JSON",
  yaml: "YAML",
  js: "JavaScript",
  http: "HTTP",
  text: "Text",
};

export function normalizeLanguage(lang = "text") {
  const key = String(lang).toLowerCase();
  return ALIASES[key] ?? key;
}

export function highlight(code, lang) {
  const grammar = GRAMMARS[normalizeLanguage(lang)];
  if (!grammar) return escape(code);
  let out = "";
  let last = 0;
  for (const match of code.matchAll(grammar)) {
    const kind = Object.keys(match.groups).find((name) => match.groups[name] !== undefined);
    out += escape(code.slice(last, match.index));
    out += `<span class="tok-${kind}">${escape(match[0])}</span>`;
    last = match.index + match[0].length;
  }
  return out + escape(code.slice(last));
}
