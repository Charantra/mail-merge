/** Browser-safe send limits, shared by the compose screen and POST /api/send. */

/** Investors per batch, and the most one send request may carry. */
export const BATCH_SIZE = 20

/** Sending halts for a session once bounces exceed this share of sent mail. */
export const MAX_BOUNCE_PCT = 5

const EMAIL = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:".]{2,}$/

/** Invalid addresses in this batch. One of these holds the whole batch. */
export function batchHolds(addresses: string[]): string[] {
  const holds: string[] = []
  const seen = new Set<string>()
  for (const raw of addresses) {
    const address = raw.trim()
    const key = address.toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    if (!EMAIL.test(address)) holds.push(`${address} is not a valid email.`)
  }
  return holds
}
