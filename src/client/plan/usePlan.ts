import { useCallback, useEffect, useState } from 'react'

import type { Plan, Refusal } from '../../shared/plan'
import { isPlanRefused } from '../../shared/plan'
import { createPlanWriter, type PlanEdit } from './writer'

/**
 * The Plan's half of one Article Agent: state blob in, edits back out through
 * `setState` — §3, rule 1. `useArticleAgent` owns the socket and passes a way to
 * reach it, so nothing here opens one.
 */

export type PlanConnection = {
	/** The Plan the writer sees, and null until the first state update arrives. */
	plan: Plan | null
	/** Takes what the builders in edits.ts return, null included, and hands back
	 * why the edit did not land — a Proposal ruling needs that in the same turn. */
	edit: (edit: PlanEdit) => Refusal | null
	/** Cleared by the next edit. */
	refusal: Refusal | null
	/** What the Article Agent said when a write did not parse. Reaching this is
	 * a bug in the applier, and it is shown rather than swallowed. */
	rejected: string | null
}

export type PlanChannel = {
	connection: PlanConnection
	/** The two `useAgent` handlers the Plan needs. */
	onStateUpdate: (state: Plan, source: 'server' | 'client') => void
	/** One frame off the socket, already parsed by `useArticleAgent` — the Plan
	 * reads the ones it recognises and ignores the rest. */
	onFrame: (frame: unknown) => void
}

/** `send` reaches whichever client is current. `useArticleAgent` supplies one
 * that keeps its identity, since the writer below is built once. */
export function usePlanChannel(send: (plan: Plan) => void): PlanChannel {
	const [plan, setPlan] = useState<Plan | null>(null)
	const [refusal, setRefusal] = useState<Refusal | null>(null)
	const [rejected, setRejected] = useState<string | null>(null)

	// One per mount: the cleanup below disposes on `writer` changing.
	const [writer] = useState(() =>
		createPlanWriter({ send, onPlan: setPlan, onRefusal: setRefusal }),
	)

	// Flushing on the way out is what keeps the last keystroke of a burst.
	useEffect(() => () => writer.dispose(), [writer])

	const edit = useCallback(
		(next: PlanEdit) => {
			setRefusal(null)
			setRejected(null)

			return writer.edit(next)
		},
		[writer],
	)

	// A client update is the echo of a write the writer already holds.
	const onStateUpdate = (state: Plan, source: 'server' | 'client') => {
		if (source === 'server') writer.receive(state)
	}

	const onFrame = (frame: unknown) => {
		if (isPlanRefused(frame)) setRejected(frame.error)
	}

	return { connection: { plan, edit, refusal, rejected }, onStateUpdate, onFrame }
}
