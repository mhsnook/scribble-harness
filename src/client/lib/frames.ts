/** Parses one socket frame. `useArticleAgent` owns the one `onMessage` handler
 * and calls this once per frame. */

/** Returns null rather than throwing, because frames a reader does not want are
 * ordinary, and a binary one is not JSON either. */
export function parseFrame(data: unknown): unknown {
	if (typeof data !== 'string') return null

	try {
		return JSON.parse(data)
	} catch {
		return null
	}
}
