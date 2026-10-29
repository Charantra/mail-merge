/** Browser-safe send limits, shared by the compose screen and POST /api/send. */

/** Investors per batch, and the most one send request may carry. */
export const BATCH_SIZE = 20

/** Sending halts for a session once bounces exceed this share of sent mail. */
export const MAX_BOUNCE_PCT = 5
