// Recipient checks that need no chain access: names that imitate trusted ones.

// Two names within two edits of each other but not equal is the shape of a lookalike attack:
// vendor.near against vend0r.near. Cheap to compute on a short allowlist.
export function editDistance(a: string, b: string): number {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) rows[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
    }
  }
  return rows[a.length][b.length];
}

/// Folds the characters scammers swap for each other, so vend0r and vendor read the same.
export function skeleton(account: string): string {
  return account.toLowerCase().replace(/rn/g, "m").replace(/vv/g, "w").replace(/[0]/g, "o").replace(/[1il|]/g, "l").replace(/[5]/g, "s").replace(/[-_]/g, "");
}
