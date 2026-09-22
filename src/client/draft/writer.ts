import type { BlockRow, DraftChange, DraftSaved } from '../../shared/draft'

/**
 * The Draft's one writer. It watches for changes, reads the document when it is
 * time to save, and sends the Blocks that differ from what the Article Agent
 * has acknowledged.
 *
 * There is no React in here, which is what lets the cadence be tested against a
 * clock rather than against a rendered editor.
 */

/** How long a pause ends a burst of typing. */
export const DRAFT_WRITE_DELAY_MS = 800

/** The longest a writer in flow goes unsaved. Without a ceiling, a debounce
 * that restarts on every keystroke never fires for someone who does not pause. */
export const DRAFT_MAX_WAIT_MS = 5000

export type DraftStatus =
	| { state: 'clean' | 'pending' | 'saving'; savedAt: number | null }
	| { state: 'failed'; savedAt: number | null; failure: string }

export type DraftWriterOptions = {
	/**
	 * The Draft as the editor holds it now, orded against what came before.
	 *
	 * A callback rather than rows handed in, because reading the document means
	 * walking it and serialising every Block. Doing that per keystroke would
	 * make the writer the thing that makes typing feel slow; this way it happens
	 * once per save.
	 */
	read: (previous: readonly BlockRow[]) => readonly BlockRow[]
	save: (change: DraftChange) => Promise<DraftSaved>
	onStatus: (status: DraftStatus) => void
	/** The sentence a failed save shows. */
	describeFailure: (error: unknown) => string
	delayMs?: number
	maxWaitMs?: number
}

export type DraftWriter = {
	readonly status: DraftStatus
	/** Seed from what the Article Agent already holds. Writes nothing. */
	load: (rows: readonly BlockRow[]) => void
	/** The editor changed. Schedules a save; reads nothing yet. */
	touch: () => void
	/** Send what is waiting, now. */
	flush: () => void
	/** Flush and stop. Re-usable, because hiding the Draft Panel runs this and
	 * showing it again has to carry on from the same baseline. */
	dispose: () => void
}

export function createDraftWriter(options: DraftWriterOptions): DraftWriter {
	const delayMs = options.delayMs ?? DRAFT_WRITE_DELAY_MS
	const maxWaitMs = options.maxWaitMs ?? DRAFT_MAX_WAIT_MS

	/** Passed back to `read` so a Block keeps its ord across a save that failed. */
	let lastRead: readonly BlockRow[] = []
	/** id → content. What a delta is measured against, so a failed save is still
	 * owed by the next one. */
	let acknowledged = new Map<string, string>()

	let pauseTimer: ReturnType<typeof setTimeout> | null = null
	let ceilingTimer: ReturnType<typeof setTimeout> | null = null
	let inFlight: DraftChange | null = null
	let changedWhileSending = false
	let status: DraftStatus = { state: 'clean', savedAt: null }

	const reportStatus = (next: DraftStatus) => {
		status = next
		options.onStatus(next)
	}

	const clearTimers = () => {
		if (pauseTimer !== null) clearTimeout(pauseTimer)
		if (ceilingTimer !== null) clearTimeout(ceilingTimer)
		pauseTimer = null
		ceilingTimer = null
	}

	const saveSettled = (receipt: DraftSaved, sent: DraftChange) => {
		// What was sent, not what is on screen — the writer kept typing while
		// this was in flight, and those changes are still owed.
		for (const block of sent.blocks) {
			acknowledged.set(block.id, JSON.stringify(block.json))
		}
		for (const id of sent.removed) acknowledged.delete(id)

		inFlight = null
		reportStatus({ state: 'clean', savedAt: receipt.savedAt })

		if (changedWhileSending) {
			changedWhileSending = false
			// Scheduled rather than sent, so a writer in unbroken flow keeps one
			// cadence instead of saving again the moment the wire is free.
			scheduleSend()
		}
	}

	const saveFailed = (error: unknown, savedAt: number | null) => {
		// `acknowledged` is deliberately not advanced: those Blocks ride the next
		// save. Nothing retries on a timer — the typing is the retry, and a loop
		// against a server that is refusing is a loop.
		inFlight = null
		reportStatus({ state: 'failed', savedAt, failure: options.describeFailure(error) })
	}

	const sendChange = () => {
		clearTimers()

		if (inFlight !== null) {
			changedWhileSending = true
			return
		}

		lastRead = options.read(lastRead)

		const changed = lastRead.filter(
			(row) => acknowledged.get(row.id) !== JSON.stringify(row.json),
		)
		const liveIds = new Set(lastRead.map((row) => row.id))
		const removed = [...acknowledged.keys()].filter((id) => !liveIds.has(id))

		if (changed.length === 0 && removed.length === 0) {
			reportStatus({ state: 'clean', savedAt: status.savedAt })
			return
		}

		const change: DraftChange = { blocks: [...changed], removed }
		const savedAt = status.savedAt

		inFlight = change
		reportStatus({ state: 'saving', savedAt })
		options.save(change).then(
			(receipt) => saveSettled(receipt, change),
			(error: unknown) => saveFailed(error, savedAt),
		)
	}

	const scheduleSend = () => {
		if (pauseTimer !== null) clearTimeout(pauseTimer)
		pauseTimer = setTimeout(sendChange, delayMs)

		// Started once and never restarted. A ceiling that resets on a keystroke
		// is a second debounce, which is the thing it exists to backstop.
		if (ceilingTimer === null) ceilingTimer = setTimeout(sendChange, maxWaitMs)
	}

	return {
		get status() {
			return status
		},

		load(rows) {
			lastRead = rows
			acknowledged = new Map(rows.map((row) => [row.id, JSON.stringify(row.json)]))
			reportStatus({ state: 'clean', savedAt: null })
		},

		touch() {
			if (status.state === 'clean') {
				reportStatus({ state: 'pending', savedAt: status.savedAt })
			}
			scheduleSend()
		},

		flush: sendChange,
		dispose() {
			sendChange()
			clearTimers()
		},
	}
}
