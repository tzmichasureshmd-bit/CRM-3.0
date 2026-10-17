export const TONE_COLORS: Record<string, string> = {
  blue: '#4f6df5',
  violet: '#8b5cf6',
  green: '#28c99a',
  amber: '#f4c95d',
  red: '#f46b72',
  cyan: '#06b6d4',
  slate: '#8790aa',
};

export function toneColor(tone?: string): string {
  return TONE_COLORS[tone ?? 'blue'] ?? TONE_COLORS.blue;
}

/** Guess a value kind from a series/column key for formatting. */
export function kindForKey(key: string): 'currency' | 'percent' | 'number' {
  const k = key.toLowerCase();
  if (/rate|percent|conversion|share/.test(k)) return 'percent';
  if (/revenue|value|pipeline|amount|spend|cost|price/.test(k)) return 'currency';
  return 'number';
}
