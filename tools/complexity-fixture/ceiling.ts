// Guards the Node complexity ceiling: cyclomatic complexity 15 must lint, 16 must not.
export function atTheCeiling(n: number): number {
  let score = 0;
  if (n > 1) score++;
  if (n > 2) score++;
  if (n > 3) score++;
  if (n > 4) score++;
  if (n > 5) score++;
  if (n > 6) score++;
  if (n > 7) score++;
  if (n > 8) score++;
  if (n > 9) score++;
  if (n > 10) score++;
  if (n > 11) score++;
  if (n > 12) score++;
  if (n > 13) score++;
  if (n > 14) score++;
  return score;
}
