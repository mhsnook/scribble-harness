/** Parses one socket frame. `useArticleAgent` owns the one `onMessage` handler
 * and calls this once per frame. */

/** Frames a reader does not want are ordinary, and a binary one is not JSON. */
export function parseFrame(data: unknown): unknown {
	if (typeof data !== 'string') return null

	try {
		return JSON.parse(data)
	} catch {
		return null
	}
}
