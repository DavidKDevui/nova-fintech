const TITLES_TO_REMOVE = /\b(m|mme|mr|mlle|monsieur|madame|mademoiselle|dr|docteur)\b/gi;
const ACCENTS_MAP: Record<string, string> = {
  "à": "a", "â": "a", "ä": "a", "á": "a",
  "è": "e", "ê": "e", "ë": "e", "é": "e",
  "ì": "i", "î": "i", "ï": "i", "í": "i",
  "ò": "o", "ô": "o", "ö": "o", "ó": "o",
  "ù": "u", "û": "u", "ü": "u", "ú": "u",
  "ÿ": "y", "ý": "y",
  "ç": "c", "ñ": "n",
};
const ACCENT_REGEX = new RegExp(`[${Object.keys(ACCENTS_MAP).join("")}]`, "g");

function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(ACCENT_REGEX, (char) => ACCENTS_MAP[char] || char)
    .replace(TITLES_TO_REMOVE, "")
    .replace(/[.\-']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getSortedTokens(normalized: string): string[] {
  return normalized.split(" ").filter(Boolean).sort();
}

function getConcatenated(normalized: string): string {
  return normalized.replace(/\s/g, "");
}

export function namesMatch(nameA: string, nameB: string): boolean {
  const normA = normalize(nameA);
  const normB = normalize(nameB);

  // Check 1: sorted tokens match
  const tokensA = getSortedTokens(normA);
  const tokensB = getSortedTokens(normB);

  if (
    tokensA.length > 0 &&
    tokensB.length > 0 &&
    tokensA.length === tokensB.length &&
    tokensA.every((t, i) => t === tokensB[i])
  ) {
    return true;
  }

  // Check 2: concatenated match
  const concatA = getConcatenated(normA);
  const concatB = getConcatenated(normB);

  if (concatA.length > 0 && concatA === concatB) {
    return true;
  }

  return false;
}
