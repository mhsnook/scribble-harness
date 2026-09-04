import { SELF } from 'cloudflare:test'

/** One JSON frame off the Article Agent's WebSocket. The socket is
 * multiplexed — state, RPC, identity, and MCP frames all ride it — so a test
 * asks for the frame it wants rather than reading the next one. */
export type Frame = { type: string } & Record<string, unknown>

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * A test client speaking the Agents SDK's wire protocol directly. The real
 * client is `useAgent`, which needs React and a browser, so a workerd test
 * sends the frames itself.
 */
export async function openAgentSocket(name: string) {
	const response = await SELF.fetch(`https://harness.test/agents/article-agent/${name}`, {
		headers: { Upgrade: 'websocket' },
	})

	const socket = response.webSocket
	if (!socket)
		throw new Error(`The Agent route answered ${response.status}, not a socket.`)
	socket.accept()

	/** Frames that have arrived and not yet been taken. `take` splices what it
	 * returns, so what is left is exactly what a later call may still match. */
	const frames: Frame[] = []
	socket.addEventListener('message', (event) => {
		frames.push(JSON.parse(event.data as string) as Frame)
	})

	/** The first untaken frame the predicate accepts. Polls, because a broadcast
	 * arrives whenever the Agent sends it. */
	async function take(match: (frame: Frame) => boolean, wanted: string): Promise<Frame> {
		const deadline = Date.now() + 2000
		do {
			const index = frames.findIndex(match)
			if (index !== -1) return frames.splice(index, 1)[0]
			await wait(10)
		} while (Date.now() < deadline)

		throw new Error(`No ${wanted} frame arrived on the ${name} socket.`)
	}

	/** Every chunk of one Chat turn's UI message stream, in arrival order: a
	 * stream is a sequence, so this takes the next chunk each time rather than
	 * matching on what it holds.
	 *
	 * `useAgentChat` is the real client, and it needs React, so this drives the
	 * same `cf_agent_use_chat_*` frames itself. */
	async function readChatStream(id: string): Promise<Frame[]> {
		const chunks: Frame[] = []

		for (;;) {
			const frame = await take(
				(candidate) =>
					candidate.type === 'cf_agent_use_chat_response' && candidate.id === id,
				'Chat stream chunk',
			)

			// A frame carries one JSON chunk, except the terminal one the Agent
			// sends when a turn produced no response at all, which carries prose.
			if (typeof frame.body === 'string' && frame.body.startsWith('{')) {
				chunks.push(JSON.parse(frame.body) as Frame)
			}
			if (frame.done === true) return chunks
		}
	}

	return {
		/** Push a Plan up the socket, the way the client applies every Plan
		 * write. Nothing is awaited: the Agent answers with a broadcast or an
		 * error frame. */
		setState(state: unknown) {
			socket.send(JSON.stringify({ type: 'cf_agent_state', state }))
		},

		/** Send one Chat turn and read its stream to the end.
		 *
		 * The Plan rides in `body`, which is request-only, and never in
		 * `metadata`, which persists on the `UIMessage` and re-rides every turn
		 * — `docs/chat.md`. */
		async chat(text: string, body: Record<string, unknown> = {}): Promise<Frame[]> {
			const id = crypto.randomUUID()
			const message = {
				id: crypto.randomUUID(),
				role: 'user',
				parts: [{ type: 'text', text }],
			}

			socket.send(
				JSON.stringify({
					type: 'cf_agent_use_chat_request',
					id,
					init: {
						method: 'POST',
						body: JSON.stringify({
							messages: [message],
							trigger: 'submit-message',
							...body,
						}),
					},
				}),
			)

			return readChatStream(id)
		},

		/** Call a `@callable` method and wait for its answer. */
		async call<T>(method: string, ...args: unknown[]): Promise<T> {
			const id = crypto.randomUUID()
			socket.send(JSON.stringify({ type: 'rpc', id, method, args }))

			const frame = await take(
				(candidate) => candidate.type === 'rpc' && candidate.id === id,
				`rpc answer to ${method}`,
			)
			if (frame.success !== true) throw new Error(String(frame.error))

			return frame.result as T
		},

		/** The next frame of this type the test has not already taken. */
		next(type: string): Promise<Frame> {
			return take((frame) => frame.type === type, type)
		},

		/** Every frame of this type still untaken once the wire goes quiet. Use
		 * it to assert that nothing arrived. */
		async quiet(type: string): Promise<Frame[]> {
			await wait(50)

			return frames.filter((frame) => frame.type === type)
		},
	}
}
