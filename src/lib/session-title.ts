export function titleFromPrompt(prompt: string): string | null {
  return (
    prompt
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean)
      ?.replace(/\s+/g, " ")
      .slice(0, 60) ?? null
  );
}
