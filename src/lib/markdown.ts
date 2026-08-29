/**
 * Plain-text projection for notification surfaces that cannot render Markdown.
 * Fenced payloads disappear; inline markup is unwrapped so the content remains.
 */
export function markdownToPlainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?(?:```|$)/g, " ")
    .replace(/!\[([^\]\n]*)\]\([^\n)]*\)/g, "$1")
    .replace(/\[([^\]\n]+)\]\([^\n)]*\)/g, "$1")
    .replace(/(\*\*|__)([^*_\n]+)\1/g, "$2")
    .replace(/(\*|_|`|~~)([^*_`\n]+)\1/g, "$2")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+[.)]\s+/gm, "")
    .replace(/^\s*#{1,6}\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}
