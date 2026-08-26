import { SELF } from 'cloudflare:test'
import { PROTO_PARAM, PROTO_VALUE, type SequencedBatch } from 'party-db'

/**
 * A test client on the Article Agent's party-db socket — the second socket of
 * architecture.md §12. The real client is `partyTransport`, which the browser
 * runs; a workerd test connects the same way it does: the partyserver route,
 * `?proto=party-db`, and `?since` for a reconnect.
 */

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export async function openSyncSocket(name: string, since?: number) {
	const query = since === undefined ? '' : `&since=${since}`
	const response = await SELF.fetch(
		`https://harness.test/parties/article-agent/${name}?${PROTO_PARAM}=${PROTO_VALUE}${query}`,
		{ headers: { Upgrade: 'websocket' } },
	)

	const socket = response.webSocket
	if (!socket)
		throw new Error(`The party route answered ${response.status}, not a socket.`)
	socket.accept()

	/** Every frame in arrival order, batches and strays alike. A sync socket
	 * should carry only `SequencedBatch` frames, and keeping the strays is what
	 * lets a test assert that. */
	const frames: unknown[] = []
	socket.addEventListener('message', (event) => {
		frames.push(JSON.parse(event.data as string))
	})

	return {
		/** The first untaken batch on this channel. Polls, because a commit lands
		 * whenever the Article Agent makes it. */
		async next(channel: string): Promise<SequencedBatch> {
			const deadline = Date.now() + 2000
			do {
				const index = frames.findIndex(
					(frame) => isBatch(frame) && frame.channel === channel,
				)
				if (index !== -1) return frames.splice(index, 1)[0] as SequencedBatch
				await wait(10)
			} while (Date.now() < deadline)

			throw new Error(`No ${channel} batch arrived on the ${name} sync socket.`)
		},

		/** Everything still unclaimed once the wire goes quiet. */
		async settled(): Promise<{ batches: SequencedBatch[]; strays: unknown[] }> {
			await wait(50)

			return {
				batches: frames.filter(isBatch),
				strays: frames.filter((frame) => !isBatch(frame)),
			}
		},
	}
}

/** A `SequencedBatch` and nothing else carries a channel and its ops. */
export function isBatch(frame: unknown): frame is SequencedBatch {
	return (
		typeof frame === 'object' &&
		frame !== null &&
		typeof (frame as SequencedBatch).channel === 'string' &&
		Array.isArray((frame as SequencedBatch).ops)
	)
}

/** One client collection write, POSTed the way `partyTransport.send` does. */
export function postWrite(name: string, body: unknown): Promise<Response> {
	return SELF.fetch(`https://harness.test/parties/article-agent/${name}?proto=party-db`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body),
	})
}
