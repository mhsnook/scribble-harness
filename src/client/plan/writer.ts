import type { OpName, Plan, ProposalInput, Refusal } from '../../shared/plan'
import { applyProposal } from '../../shared/plan'

/**
 * The Plan's one writer. It holds the Plan the writer sees, applies each edit
 * locally, and hands the result to the Article Agent — docs/architecture.md §3,
 * rule 1.
 *
 * **It debounces while the writer types.** The Plan is one blob re-serialised
 * and broadcast on every write, so an un-debounced intent-note field sends
 * about 40 KB per keystroke — `docs/plan.md`.
 *
 * There is no React in here, which is what lets the debounce be tested against
 * a clock rather than against a rendered field.
 */

/** How long a pause ends a burst of typing. */
export const WRITE_DELAY_MS = 400

/** The ops a keystroke produces. A burst of these is one write, and every other
 * op goes at once: an Adjective is committed with a key rather than typed into
 * the Plan, and nothing structural comes from a held-down key at all. */
const typedOps = new Set<OpName>(['setTitle', 'setIntent', 'setTarget', 'setVoice'])

export type PlanWriterOptions = {
	/** Hand the Plan to the Article Agent. Every write goes through this. */
	send: (plan: Plan) => void
	/** The Plan the writer sees, after each edit and each Article Agent update. */
	onPlan: (plan: Plan) => void
	/** Why an edit did not land. The applier writes the sentence. */
	onRefusal?: (refusal: Refusal) => void
	delayMs?: number
}

/**
 * An edit, or a builder handed the Plan the writer holds now. A caller building
 * one after a round trip wants the builder, having closed over an older render.
 */
export type PlanEdit = ProposalInput | null | ((plan: Plan) => ProposalInput | null)

export type PlanWriter = {
	/** The Plan as the writer sees it, and null until the first one arrives. */
	readonly plan: Plan | null
	/** True while a typed edit is waiting for the pause that sends it. */
	readonly pending: boolean
	/** Apply an edit and schedule the write. Returns the refusal, or null when
	 * it landed. An edit built as null — a Section that cannot move up — is not
	 * an edit, and does nothing. */
	edit: (edit: PlanEdit) => Refusal | null
	/** Take an update from the Article Agent. */
	receive: (plan: Plan) => void
	/** Send what is waiting, now. */
	flush: () => void
	/** Flush and stop. Called when the Panel goes away, so the last keystroke of
	 * a burst is not the one that gets lost. */
	dispose: () => void
}

export function createPlanWriter(options: PlanWriterOptions): PlanWriter {
	const delayMs = options.delayMs ?? WRITE_DELAY_MS

	let plan: Plan | null = null
	let timer: ReturnType<typeof setTimeout> | null = null
	let unsent = false

	const clear = () => {
		if (timer === null) return
		clearTimeout(timer)
		timer = null
	}

	const flush = () => {
		clear()
		if (!unsent || plan === null) return

		unsent = false
		options.send(plan)
	}

	return {
		get plan() {
			return plan
		},
		get pending() {
			return timer !== null
		},

		edit(edit) {
			if (plan === null) return notYet

			const ops = typeof edit === 'function' ? edit(plan) : edit
			if (ops === null) return null

			const result = applyProposal(plan, ops)
			if (!result.ok) {
				options.onRefusal?.(result.refusal)
				return result.refusal
			}

			plan = result.plan
			unsent = true
			options.onPlan(result.plan)

			if (ops.every((op) => typedOps.has(op.op))) {
				clear()
				timer = setTimeout(flush, delayMs)
			} else {
				flush()
			}

			return null
		},

		receive(next) {
			// The client is the Plan's only writer, so an update arriving over an
			// edit of ours is the echo of an older one — §3, rule 1. Taking it would
			// undo what the writer can see on screen.
			if (unsent || timer !== null) return

			plan = next
			options.onPlan(next)
		},

		flush,
		dispose() {
			flush()
			clear()
		},
	}
}

/** An edit made before the first Plan arrives. The Panel renders nothing to
 * edit until then, so this is a guard rather than a state the writer meets. */
const notYet: Refusal = {
	type: 'missing',
	reason: 'noPlan',
	index: null,
	op: null,
	subject: null,
	other: null,
	message: 'The Plan has not arrived from the Article Agent yet.',
}
