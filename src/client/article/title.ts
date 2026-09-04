import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'

import { editArticle } from '../articles/api'
import { keepArticle } from '../articles/useArticles'
import { failureText } from '../lib/failure'
import { setTitle } from '../plan/edits'
import type { PlanConnection } from '../plan/usePlan'

/**
 * An Article's title, across the two places it lives. The Plan is written first
 * and the index copy follows it — docs/architecture.md §4.6.
 */

/**
 * The name the new-Article dialog collected, written into the Plan once it
 * arrives. It goes here rather than to the index so `useTitleCopy` sends the
 * copy on, which is the order every later rename takes.
 */
export function useSeedTitle(connection: PlanConnection, seed: string | undefined): void {
	const { plan, edit } = connection
	const done = useRef(false)

	useEffect(() => {
		if (done.current || plan === null) return
		if (seed === undefined || seed.trim() === '') return

		done.current = true
		if (plan.title === '') edit(setTitle(plan, null, seed))
	}, [plan, seed, edit])
}

/** Long enough to swallow a burst of typing. */
const pause = 600

/**
 * The index's copy, debounced beside the Plan's own writer and flushed on the
 * way out. Hands back the sentence for a copy that did not land — except from
 * the flush, where the screen that would show it has gone.
 */
export function useTitleCopy(articleId: string, title: string | null): string | null {
	const client = useQueryClient()
	const [failure, setFailure] = useState<string | null>(null)

	// Refs, so a rename does not re-run the effect that decides whether it is one.
	// `pending` is a title a debounce is still holding.
	const held = useRef<{ sent: string | null; pending: string | null }>({
		sent: null,
		pending: null,
	})

	const write = useCallback(
		(next: string) => {
			held.current.pending = null
			setFailure(null)

			editArticle(articleId, { title: next }).then(
				(article) => keepArticle(client, article),
				(error: unknown) =>
					setFailure(failureText("The list's copy of the title didn't save.", error)),
			)
		},
		[articleId, client],
	)

	useEffect(() => {
		if (title === null) return

		const state = held.current

		// The first Plan to arrive is the one the index already has a copy of.
		if (state.sent === null) {
			state.sent = title
			return
		}
		if (title === state.sent) return

		state.sent = title
		state.pending = title
		const timer = setTimeout(() => write(title), pause)

		return () => clearTimeout(timer)
	}, [title, write])

	// Runs after the effect above has cleared its timer, so what is left is a
	// rename the debounce never sent.
	useEffect(() => {
		const state = held.current

		return () => {
			if (state.pending !== null) write(state.pending)
		}
	}, [write])

	return failure
}
