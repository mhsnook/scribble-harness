import {
	generateText,
	type LanguageModel,
	type ToolCallRepairFunction,
	type ToolSet,
} from 'ai'

/**
 * One retry of a tool call the schema refused, carrying the validation error
 * back to the model — `docs/plan.md` and `docs/llm.md`.
 *
 * The op payloads are strict, so a model that adds one field fails the whole
 * call rather than having the field stripped: stripping would produce a
 * Proposal the model did not make, and the writer would rule on it without
 * seeing what was dropped. The cost is real. A model that adds the same field
 * every time thrashes this retry instead of converging, and the answer to that
 * is naming the field in the schema, not loosening the payload.
 *
 * The AI SDK calls this once per refused call, so one retry is the whole
 * budget. Returning null gives up and lets the turn carry the error.
 *
 * The tools come from the callback rather than from an import, so this belongs
 * to no one pack — `docs/llm.md` lists four, and each of them wants the same retry.
 */
export function repairToolCall(model: LanguageModel): ToolCallRepairFunction<ToolSet> {
	return async ({ system, messages, toolCall, tools, error }) => {
		const { toolCalls } = await generateText({
			model,
			system,
			messages: [
				...messages,
				{
					role: 'user',
					content: [
						`The ${toolCall.toolName} call was refused: ${error.message}`,
						'Call it again, correcting only what the error names.',
					].join('\n'),
				},
			],
			tools,
			toolChoice: 'required',
		})

		const [call] = toolCalls
		if (!call || call.toolName !== toolCall.toolName) return null

		return { ...toolCall, input: JSON.stringify(call.input) }
	}
}
