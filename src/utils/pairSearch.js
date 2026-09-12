/**
 * Rank whitelist pairs for the K-line search box.
 *
 * Prefix matches come first, then substring matches, both case-insensitive, so
 * typing `btc` puts `BTC/USDT` above `WBTC/USDT`. An empty query returns a copy
 * of the whole list, which is what opening the box should show.
 *
 * @param {string[]} pairs
 * @param {string} query
 * @returns {string[]}
 */
export function filterPairs(pairs, query) {
  const list = Array.isArray(pairs) ? pairs : []
  const needle = String(query ?? '')
    .trim()
    .toUpperCase()
  if (!needle) return [...list]

  const starts = []
  const holds = []
  for (const item of list) {
    const upper = String(item).toUpperCase()
    if (upper.startsWith(needle)) starts.push(item)
    else if (upper.includes(needle)) holds.push(item)
  }
  return [...starts, ...holds]
}
