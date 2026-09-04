import type { ModelMessage, UIMessage } from 'ai'
import { MockLanguageModelV3, simulateReadableStream } from 'ai/test'
import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'

import { chatTurn } from '../../src/server/llm/chat-turn'
import { chatPackMessages } from '../../src/server/llm/prompt'
import type { WebSearch } from '../../src/server/llm/search'
import type { ProposalInput } from '../../src/shared/plan'
import { makeNode, makePlan } from '../shared/plan-fixtures'
import { type Frame, openAgentSocket } from './agent-socket'
import { calledATool, noUsage, scriptModel, scriptSearch, stopped } from './scripted'

/**
 * The server side of a Chat turn — `docs/chat.md` and `docs/llm.md`.
 *
 * No test calls a model: Workers AI is a remote-only binding and
 * `vitest.config.ts` keeps remote bindings off, so a fresh clone can run
 * `pnpm test` without an API token. What these tests drive instead is the
 * Article Agent's `chatModel()` method, replaced with a scripted one. The
 * boundary under test is what the turn does with a model's answer, and that is
 * the same boundary either way.
 */

/** One part of a scripted model's stream. Read off `MockLanguageModelV3`
 * rather than imported: the union lives in `@ai-sdk/provider`, which this repo
 * has only as a transitive package. Stating it is what keeps a chunk list from
 * widening to `string` and typechecking against nothing. */
type StreamResult = Awaited<ReturnType<MockLanguageModelV3['doStream']>>
type StreamPart = StreamResult['stream'] extends ReadableStream<infer Part> ? Part : never
type GenerateResult = Awaited<ReturnType<MockLanguageModelV3['doGenerate']>>

/** One scripted turn read back as a whole answer rather than as a stream, for
 * the calls that do not stream. `repairToolCall` is the one that matters: it
 * retries a refused call with `generateText`, because nothing consumes a
 * retry's stream. */
function whole(turn: StreamPart[]): GenerateResult {
	const finish = turn.find((part) => part.type === 'finish')
	const content: GenerateResult['content'] = []

	for (const part of turn) {
		if (part.type === 'tool-call') content.push(part)
		if (part.type === 'text-delta') content.push({ type: 'text', text: part.delta })
	}

	return {
		content,
		finishReason: finish?.type === 'finish' ? finish.finishReason : stopped,
		usage: noUsage,
		warnings: [],
	}
}

/** A model that plays these turns back, one per call, streamed or whole. Both
 * entry points share the counter, so a turn that streams and then retries
 * takes the first two turns in order.
 *
 * The counter is ours rather than `MockLanguageModelV3`'s own array handling,
 * which reads `doStream[this.doStreamCalls.length]` after pushing the call and
 * so answers the first call with the second element. */
function scripted(turns: StreamPart[][]) {
	let call = 0

	return new MockLanguageModelV3({
		doStream: async () => ({
			stream: simulateReadableStream({ chunks: turns[call++] ?? [] }),
		}),
		doGenerate: async () => whole(turns[call++] ?? []),
	})
}

/** One turn of prose, the way a turn that discusses the Plan answers. */
function proseTurn(text: string): StreamPart[] {
	return [
		{ type: 'stream-start', warnings: [] },
		{ type: 'text-start', id: 't1' },
		{ type: 'text-delta', id: 't1', delta: text },
		{ type: 'text-end', id: 't1' },
		{ type: 'finish', finishReason: stopped, usage: noUsage },
	]
}

/** A model that answers in prose and stops. */
function speaks(text: string) {
	return scripted([proseTurn(text)])
}

/** One turn calling the search tool. It carries an `execute`, so the call
 * resolves on the server and the model reads the result in the step after. */
function searchTurn(query: string): StreamPart[] {
	const input = JSON.stringify({ query })

	return [
		{ type: 'stream-start', warnings: [] },
		{ type: 'tool-input-start', id: 'call-s', toolName: 'webSearch' },
		{ type: 'tool-input-delta', id: 'call-s', delta: input },
		{ type: 'tool-input-end', id: 'call-s' },
		{ type: 'tool-call', toolCallId: 'call-s', toolName: 'webSearch', input },
		{ type: 'finish', finishReason: calledATool, usage: noUsage },
	]
}

/** One turn calling the Proposal tool. The tool has no `execute`, so the call
 * suspends rather than running, and that suspension is the Proposal. */
function proposalTurn(input: string): StreamPart[] {
	return [
		{ type: 'stream-start', warnings: [] },
		{ type: 'tool-input-start', id: 'call-1', toolName: 'proposePlanChange' },
		{ type: 'tool-input-delta', id: 'call-1', delta: input },
		{ type: 'tool-input-end', id: 'call-1' },
		{
			type: 'tool-call',
			toolCallId: 'call-1',
			toolName: 'proposePlanChange',
			input,
		},
		{ type: 'finish', finishReason: calledATool, usage: noUsage },
	]
}

/** A model that proposes, taking each input in turn, so a test can script a
 * refused call and the retry that follows it. */
function proposes(...inputs: string[]) {
	return scripted(inputs.map(proposalTurn))
}

/** Put a scripted model, and optionally a scripted search, behind the Chat's
 * boundaries. The model records the calls made against it, so the caller keeps
 * its own reference and reads the prompt pack off `doStreamCalls`. */
async function scriptChat(
	name: string,
	model: MockLanguageModelV3,
	search?: WebSearch,
): Promise<void> {
	await scriptModel(name, 'chatModel', model)
	if (search !== undefined) await scriptSearch(name, search)
}

/** A search that finds one thing, so a turn has something to read back. */
const findsOne: WebSearch = async () => ({
	status: 'ok',
	results: [
		{ url: 'https://example.test/permits', excerpt: 'The backlog stood at 4,100.' },
	],
})

/** The guide rules one turn was given. */
const systemPrompt = (model: MockLanguageModelV3) =>
	String(
		model.doStreamCalls[0]?.prompt.find((message) => message.role === 'system')?.content,
	)

const plan = makePlan({
	title: 'The permit queue',
	totalTarget: 1200,
	outline: [
		makeNode({ id: 'n1', title: 'The opening', intent: 'Open on one refused permit.' }),
	],
})

const proposal: ProposalInput = [
	{ op: 'setTarget', nodeId: 'n1', expected: null, value: 400 },
]

/** The chunk types a turn streamed, which is what tells a Proposal turn from a
 * prose one without reaching into the transcript. */
const types = (chunks: Frame[]) => chunks.map((chunk) => chunk.type)

describe('a Chat turn', () => {
	it('returns a Proposal as a suspended tool call', async () => {
		const writer = await openAgentSocket('chat-proposal')
		await scriptChat('chat-proposal', proposes(JSON.stringify({ ops: proposal })))

		const chunks = await writer.chat('Give the opening a word count.', { plan })

		expect(types(chunks)).toContain('tool-input-available')
		expect(types(chunks)).not.toContain('tool-output-available')

		const call = chunks.find((chunk) => chunk.type === 'tool-input-available')
		expect(call).toMatchObject({
			toolName: 'proposePlanChange',
			input: { ops: proposal },
		})
	})

	it('returns prose with no tool call', async () => {
		const writer = await openAgentSocket('chat-prose')
		await scriptChat('chat-prose', speaks('Four hundred words fits that opening.'))

		const chunks = await writer.chat('Is four hundred words right for the opening?', {
			plan,
		})

		expect(types(chunks)).toContain('text-delta')
		expect(types(chunks)).not.toContain('tool-input-available')
		expect(chunks.find((chunk) => chunk.type === 'text-delta')).toMatchObject({
			delta: 'Four hundred words fits that opening.',
		})
	})

	// The transcript is append-only and the Plan is not, so the Plan follows the
	// conversation — `docs/llm.md`. It goes in front of the last message rather than after
	// it, so the writer's own words stay the last thing the model reads.
	it('packs the guide rules, then the conversation, then the Plan', async () => {
		const writer = await openAgentSocket('chat-pack')
		const model = speaks('Noted.')
		await scriptChat('chat-pack', model)

		await writer.chat('What is the opening for?', { plan })

		const [call] = model.doStreamCalls
		const system = call.prompt.find((message) => message.role === 'system')

		expect(String(system?.content)).toContain('Your own taste is')
		// The Plan is not in the prefix, which is the whole point of the ordering.
		expect(String(system?.content)).not.toContain('The permit queue')

		const [, ...conversation] = call.prompt
		expect(conversation).toHaveLength(2)

		const planBlock = JSON.stringify(conversation[0])
		expect(planBlock).toContain('The permit queue')
		expect(planBlock).toContain('Open on one refused permit.')

		expect(JSON.stringify(conversation.at(-1))).toContain('What is the opening for?')
	})

	// A tool result answers the assistant message before it, and the Plan is a
	// user message, so packing it in front of the last message would split the
	// pair — which the AI SDK refuses with MissingToolResultsError before the
	// model is called at all. The turn that resumes after the writer rules on a
	// Proposal is exactly that transcript.
	//
	// `chatTurn` directly rather than through the socket: the harness sends one
	// user message, and this case needs a transcript with a settled tool part
	// already in it.
	it('packs the Plan after a tool result rather than in front of it', async () => {
		const model = speaks('Noted.')
		const ruled = [
			{
				id: 'm1',
				role: 'user',
				parts: [{ type: 'text', text: 'Give the opening a word count.' }],
			},
			{
				id: 'm2',
				role: 'assistant',
				parts: [
					{
						type: 'tool-proposePlanChange',
						toolCallId: 'call-1',
						state: 'output-available',
						input: { ops: proposal },
						output: 'The writer Accepted this Proposal.',
					},
				],
			},
		] as unknown as UIMessage[]

		const response = await chatTurn({
			model,
			plan,
			messages: ruled,
			onFinish: async () => {},
		})

		// The stream carries the turn rather than an error, and the model was
		// reached — the pack is refused before the first call, so a turn that
		// never happened is what the defect looks like.
		expect(await response.text()).not.toContain('Tool result is missing')
		expect(model.doStreamCalls).toHaveLength(1)

		// The Plan is last here, after the tool result that ends the transcript.
		const [call] = model.doStreamCalls
		expect(JSON.stringify(call.prompt.at(-1))).toContain('The permit queue')
		expect(call.prompt.at(-2)?.role).toBe('tool')
	})

	// No search key in the test env, so `chatSearch()` hands back nothing.
	it('offers the tools the deployment can reach', async () => {
		const writer = await openAgentSocket('chat-tools')
		const model = speaks('Noted.')
		await scriptChat('chat-tools', model)

		await writer.chat('Anything to say about the outline?', { plan })

		const [call] = model.doStreamCalls
		expect(call.tools?.map((tool) => tool.name)).toEqual([
			'proposePlanChange',
			'recordOffers',
		])
	})

	/** The rules and the tools are one decision — `llm/prompt.ts`. The rules for
	 * offering a source from memory are in both, because an unavailable search
	 * puts the guide back on that path. */
	it('tells the guide it cannot browse when no search is wired', async () => {
		const writer = await openAgentSocket('chat-no-search')
		const model = speaks('Noted.')
		await scriptChat('chat-no-search', model)

		await writer.chat('Find me something recent on permits.', { plan })

		const system = systemPrompt(model)

		expect(system).toContain('You cannot browse')
		expect(system).not.toContain('webSearch tool')
		expect(system).toContain('an invented url wastes')
	})

	it('offers the search tool and the rules to match when a search is wired', async () => {
		const writer = await openAgentSocket('chat-search')
		const model = speaks('Noted.')
		await scriptChat('chat-search', model, findsOne)

		await writer.chat('Find me something recent on permits.', { plan })

		const [call] = model.doStreamCalls
		expect(call.tools?.map((tool) => tool.name)).toEqual([
			'proposePlanChange',
			'recordOffers',
			'webSearch',
		])

		const system = systemPrompt(model)
		expect(system).toContain('webSearch tool')
		expect(system).not.toContain('You cannot browse')
		expect(system).toContain('an invented url wastes')
	})

	/**
	 * The search tool carries an `execute`, so its result comes back inside the
	 * turn — and a turn that stops at the tool call throws the search away. The
	 * model has to be called again with the result in the transcript, or it can
	 * neither quote an excerpt nor fill in a source.
	 */
	it('runs the turn on past a search, so the model reads what it found', async () => {
		const writer = await openAgentSocket('chat-search-steps')
		const model = scripted([
			searchTurn('permit backlog'),
			proseTurn('The backlog stood at 4,100.'),
		])
		await scriptChat('chat-search-steps', model, findsOne)

		const chunks = await writer.chat('What is the permit backlog?', { plan })

		// Twice: once to make the call, once to read the result.
		expect(model.doStreamCalls).toHaveLength(2)

		// And the second call carries the search back to the model.
		const [, resumed] = model.doStreamCalls
		expect(JSON.stringify(resumed.prompt)).toContain('The backlog stood at 4,100.')

		expect(types(chunks)).toContain('tool-output-available')
		expect(types(chunks)).toContain('text-delta')
	})

	it('falls back to the Plan in state when the turn carries no body', async () => {
		const writer = await openAgentSocket('chat-no-body')
		// A second connection reads the broadcast, because the Agent does not
		// echo a Plan back to the connection that wrote it. Waiting on it is
		// what makes the write land before the turn reads state.
		const reader = await openAgentSocket('chat-no-body')
		await reader.next('cf_agent_state')
		writer.setState(plan)
		await reader.next('cf_agent_state')
		const model = speaks('Noted.')
		await scriptChat('chat-no-body', model)

		await writer.chat('What is the opening for?')

		const [call] = model.doStreamCalls

		// Second to last, because the writer's own message stays last.
		expect(JSON.stringify(call.prompt.at(-2))).toContain('The permit queue')
	})

	// The op payloads are strict, so a model that adds a field fails the whole
	// call rather than having the field stripped — `docs/plan.md`.
	it('retries a refused tool call, carrying the validation error back', async () => {
		const writer = await openAgentSocket('chat-retry')
		const withExtraField = JSON.stringify({
			ops: [
				{ op: 'setTarget', nodeId: 'n1', expected: null, value: 400, why: 'it is short' },
			],
		})
		const model = proposes(withExtraField, JSON.stringify({ ops: proposal }))
		await scriptChat('chat-retry', model)

		const chunks = await writer.chat('Give the opening a word count.', { plan })

		// The retry is a `generateText` call, so it lands on doGenerate rather
		// than beside the streamed turn.
		const [retry] = model.doGenerateCalls
		const reask = JSON.stringify(retry.prompt.at(-1))
		expect(reask).toContain('was refused')
		expect(reask).toContain('why')
		expect(chunks.find((chunk) => chunk.type === 'tool-input-available')).toMatchObject({
			input: { ops: proposal },
		})
	})

	// The failure mode `docs/plan.md` names as the cost of strict payloads: a model that
	// adds the same field every time thrashes the retry instead of converging.
	// One retry is the whole budget, so the second refusal ends the turn.
	it('gives up when the retry is refused too, and says so', async () => {
		const writer = await openAgentSocket('chat-retry-exhausted')
		const withExtraField = JSON.stringify({
			ops: [
				{ op: 'setTarget', nodeId: 'n1', expected: null, value: 400, why: 'it is short' },
			],
		})
		const model = proposes(withExtraField, withExtraField)
		await scriptChat('chat-retry-exhausted', model)

		const chunks = await writer.chat('Give the opening a word count.', { plan })

		// It asked twice and got nowhere, so no Proposal reaches the writer.
		expect(model.doGenerateCalls).toHaveLength(1)
		expect(types(chunks)).not.toContain('tool-input-available')
		expect(types(chunks)).toContain('tool-input-error')

		// And the error names the field the model kept adding, rather than the
		// SDK's default "An error occurred."
		const failed = chunks.find((chunk) => chunk.type === 'tool-input-error')
		expect(String(failed?.errorText)).toContain('why')
	})

	it('keeps the transcript in the Agents SDK store, and the Plan out of it', async () => {
		const writer = await openAgentSocket('chat-transcript')
		await scriptChat('chat-transcript', speaks('Noted.'))

		await writer.chat('What is the opening for?', { plan })

		const response = await env.ArticleAgent.get(
			env.ArticleAgent.idFromName('chat-transcript'),
		).fetch('https://harness.test/agents/article-agent/chat-transcript/get-messages')
		const messages = (await response.json()) as { role: string; parts: unknown[] }[]

		expect(messages.map((message) => message.role)).toEqual(['user', 'assistant'])
		expect(JSON.stringify(messages)).not.toContain('The permit queue')
	})
})

/**
 * Where the Plan lands, read off `chatPackMessages` directly — `docs/llm.md`.
 *
 * The turns above drive the two transcripts the product actually produces: one
 * ending on the writer's message, and one ending on a settled tool result. The
 * two below are the transcripts the slot rule also has to answer for, and
 * neither arrives through a socket, so they are asserted on the function.
 */
describe('the Plan slot', () => {
	const carriesThePlan = (message: ModelMessage) =>
		JSON.stringify(message).includes('The permit queue')

	it('puts the Plan first when there is no conversation yet', () => {
		const packed = chatPackMessages([], plan)

		expect(packed).toHaveLength(1)
		expect(carriesThePlan(packed[0])).toBe(true)
	})

	// An assistant message ends the transcript whenever the writer sends the
	// next turn before reading the last one, and after a turn that answered in
	// prose and stopped. There is no tool pair to split, so nothing forbids the
	// Plan in front of it — it goes last anyway, because the rule reads the role
	// of the final message rather than hunting for the writer's own.
	it('puts the Plan last when the conversation ends on the assistant', () => {
		const conversation: ModelMessage[] = [
			{ role: 'user', content: 'What is the opening for?' },
			{ role: 'assistant', content: 'It opens on one refused permit.' },
		]

		const packed = chatPackMessages(conversation, plan)

		expect(packed).toHaveLength(3)
		expect(carriesThePlan(packed[2])).toBe(true)
		expect(packed[1].role).toBe('assistant')
	})

	// The packing never edits the conversation it was handed: every message
	// arrives in the order it was given, with the Plan the only addition.
	it('leaves the conversation in order and adds nothing else', () => {
		const conversation: ModelMessage[] = [
			{ role: 'user', content: 'What is the opening for?' },
			{ role: 'assistant', content: 'It opens on one refused permit.' },
			{ role: 'user', content: 'Give it a word count.' },
		]

		const packed = chatPackMessages(conversation, plan)

		expect(packed).toHaveLength(4)
		expect(packed.filter(carriesThePlan)).toHaveLength(1)
		expect(packed.filter((message) => !carriesThePlan(message))).toEqual(conversation)
	})
})
