// Guards the Node complexity ceiling: cyclomatic complexity 10 must lint, 11 must not.
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
  return score;
}
