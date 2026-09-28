const NOISE_TOKENS = new Set(["PENDING"]);
const LEADING_NOISE = new Set(["POS", "DEBIT", "PURCHASE", "CARD", "TST", "SQ", "SPO", "PY"]);

export function normalizeText(text: string): string {
  return text
    .toUpperCase()
    .replace(/['’]/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

export function textTokens(text: string): string[] {
  return normalizeText(text).split(" ").filter(Boolean);
}

// "TST*BARRACUDA TAPHOUSE Miami FL 09/11" -> "BARRACUDA TAPHOUSE MIAMI FL": drops what changes between visits
export function normalizeDescription(description: string): string {
  const tokens = textTokens(description).filter((token) => !/\d/.test(token) && !NOISE_TOKENS.has(token));
  while (tokens.length > 1 && LEADING_NOISE.has(tokens[0]!)) tokens.shift();
  return tokens.join(" ");
}

export function containsPhrase(text: string, phrase: string): boolean {
  return phrase.length > 0 && ` ${text} `.includes(` ${phrase} `);
}

export function containsAllTokens(text: string, phrase: string): boolean {
  const have = new Set(text.split(" "));
  const want = phrase.split(" ").filter(Boolean);
  return want.length > 0 && want.every((token) => have.has(token));
}
