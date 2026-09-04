import { useQueryClient } from '@tanstack/react-query'
import { useLocation } from '@tanstack/react-router'
import {
	type FormEvent,
	type ReactNode,
	createContext,
	useContext,
	useRef,
	useState,
} from 'react'

import { type ArticleEntry, untitledArticle } from '../../shared/article'
import { Button } from '../components/Button'
import { Dialog } from '../components/Dialog'
import { TextField } from '../components/Field'
import { Notice } from '../components/Notice'
import { failureText } from '../lib/failure'
import { createArticle, discardArticle } from './api'
import { dropArticle, keepArticle } from './useArticles'

declare module '@tanstack/react-router' {
	interface HistoryState {
		/** The title the new-Article dialog collected. Lost on a reload, which is
		 * right: by then it has landed in the Plan. */
		newTitle?: string
	}
}

/**
 * Opening an Article: the row is created the moment the writer asks for one, and
 * the dialog asks what to call it while that request is still in flight.
 *
 * The typed title goes to the caller rather than to the index — writing it here
 * would put the index copy in front of the Plan it copies (architecture.md §4.6) — and the caller
 * navigates, so this module stays as router-free as the rest of `articles/`.
 */

export type NewArticleFlow = {
	/** Creates the row and opens the dialog. */
	start: () => void
	dialog: ReactNode
}

/** `opened` is handed the new Article and the name the writer typed for it. */
export function useNewArticle(
	opened: (article: ArticleEntry, title: string) => void,
): NewArticleFlow {
	const client = useQueryClient()

	const [naming, setNaming] = useState(false)
	const [opening, setOpening] = useState(false)
	const [failure, setFailure] = useState<string | null>(null)

	// The request rather than its result: the writer may confirm before it
	// answers, and awaiting this promise is the whole coordination.
	const made = useRef<Promise<ArticleEntry> | null>(null)

	/** The `catch` is not the handler — it keeps a failure while the writer is
	 * still typing from being an unhandled rejection. `confirm` reports it. */
	const begin = () => {
		const request = createArticle()
		request.catch(() => {})
		made.current = request

		return request
	}

	const start = () => {
		// A second click on the button behind the dialog would strand the first row.
		if (naming) return

		setFailure(null)
		setNaming(true)
		begin()
	}

	const confirm = (title: string) => {
		setOpening(true)
		setFailure(null)

		// Null where the last attempt failed, and then this is the retry.
		const request = made.current ?? begin()

		request.then(
			(article) => {
				made.current = null
				setNaming(false)
				setOpening(false)
				keepArticle(client, article)
				opened(article, title.trim())
			},
			(error: unknown) => {
				// Left open, holding what they typed, so confirming again retries.
				made.current = null
				setOpening(false)
				setFailure(failureText("The Article wasn't created.", error))
			},
		)
	}

	const cancel = () => {
		const request = made.current
		made.current = null
		setNaming(false)
		setOpening(false)

		// A confirm nulls this first, so the close it causes reaches here and
		// discards nothing. Otherwise it would throw away the Article the writer
		// is on their way into.
		request?.then(
			(article) => {
				discardArticle(article.id).then(
					() => dropArticle(client, article.id),
					() => {},
				)
			},
			() => {},
		)
	}

	return {
		start,
		dialog: (
			<NewArticleDialog
				failure={failure}
				onCancel={cancel}
				onConfirm={confirm}
				open={naming}
				opening={opening}
			/>
		),
	}
}

/**
 * The Area's layout route mounts one dialog above both Views and passes `start`
 * down here, so a View only needs the control that opens it.
 *
 * This lives beside the flow rather than in the route file: `autoCodeSplitting`
 * splits a route file into two chunks, and a context declared in one of them is
 * a different object from the one the other chunk reads.
 */
const StartArticleContext = createContext<(() => void) | null>(null)

export const StartArticleProvider = StartArticleContext.Provider

export function useStartArticle(): () => void {
	const start = useContext(StartArticleContext)
	if (start === null) {
		throw new Error('An Articles Area route is the only caller.')
	}

	return start
}

/** What `useSeedTitle` writes into the Plan. */
export function useNewTitle(): string | undefined {
	return useLocation({ select: (location) => location.state.newTitle })
}

function NewArticleDialog({
	open,
	opening,
	failure,
	onConfirm,
	onCancel,
}: {
	open: boolean
	/** Waiting on the create before it can redirect. */
	opening: boolean
	failure: string | null
	onConfirm: (title: string) => void
	onCancel: () => void
}) {
	const [title, setTitle] = useState('')

	const submit = (event: FormEvent) => {
		event.preventDefault()
		onConfirm(title)
	}

	const cancel = () => {
		setTitle('')
		onCancel()
	}

	return (
		<Dialog
			actions={
				<>
					<Button onClick={cancel} size="sm" variant="quiet">
						cancel
					</Button>
					<Button
						disabled={opening}
						form="new-article"
						size="sm"
						type="submit"
						variant="accent"
					>
						{opening ? 'opening…' : 'start writing'}
					</Button>
				</>
			}
			onClose={cancel}
			open={open}
			subtitle="You can change it in the Plan later, and leaving it empty is fine."
			title="What is this piece called?"
		>
			{failure === null ? null : <Notice>{failure}</Notice>}
			<form id="new-article" onSubmit={submit}>
				<TextField
					hiddenLabel="Article title"
					onChange={setTitle}
					placeholder={untitledArticle}
					value={title}
				/>
			</form>
		</Dialog>
	)
}
