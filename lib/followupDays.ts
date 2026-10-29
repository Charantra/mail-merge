/** Days after the first email when a follow-up draft is created. Default day 5 and day 7. */
export function parseFollowUpDays(raw: string | undefined): number[] {
  const src = (raw ?? '').trim() || '5,7'
  const days = Array.from(
    new Set(
      src
        .split(',')
        .map(s => Number(s.trim()))
        .filter(n => Number.isInteger(n) && n > 0),
    ),
  ).sort((a, b) => a - b)
  return days.length ? days : [5, 7]
}

/** Follow-up numbers whose day has arrived and which do not already have a row. */
export function dueFollowUpNumbers(
  daysSince: number,
  days: number[],
  existingNumbers: number[],
): number[] {
  const have = new Set(existingNumbers)
  return days
    .map((day, i) => ({ n: i + 1, day }))
    .filter(x => daysSince >= x.day && !have.has(x.n))
    .map(x => x.n)
}

/**
 * The new paragraph only. Outlook adds the quoted history when it builds the reply.
 * A pasted "Original Message" block is dropped so we do not send it twice.
 */
export function plainReplyComment(body: string): string {
  const text = body
    .replace(/\r\n/g, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\n\s*-{2,}\s*Original Message\s*-{2,}[\s\S]*$/i, '')
    .trim()
  return text
}
