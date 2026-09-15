import { useEffect, useRef, useState } from 'react'

import type { Note } from '../../shared/note'
import type { LedgerRound, NotesLedger } from '../../shared/notes-ledger'
import { Button } from '../components/Button'
import { EmptySlot } from '../components/Field'
import { cx } from '../lib/cx'
import { dateAndTime } from '../lib/when'
import type { NoteActions } from './actions'
import type { AnchorNaming } from './anchors'
import { NoteCard, NoteLine } from './NoteCard'

/**
 * Every Note on the Article, newest Round first, in a drawer over the Round the
 * Panel is showing. The sibling of `OfferLedgerDrawer`, down to leaving the
 * composer uncovered so the control that opened it is the control that closes
 * it.
 *
 * **The list is graded, not filtered.** A Note the writer has not ruled on gets
 * a card; one they have ruled on gets a line; the ones they declined get a
 * count. Nothing is hidden, and nothing they have finished with takes the room
 * of something they have not.
 *
 * Closed, it stays mounted and sits translated out of sight, so what the writer
 * had open is still open when it comes back.
 */

export interface NotesLedgerDrawerProps {
	ledger: NotesLedger
	naming: AnchorNaming
	actions: NoteActions
	open: boolean
	/** Escape and `close ×` both route here. */
	onClose: () => void
	className?: string
}

export function NotesLedgerDrawer({
	ledger,
	naming,
	actions,
	open,
	onClose,
	className,
}: NotesLedgerDrawerProps) {
	const panel = useRef<HTMLDivElement>(null)

	// Focus moves in on open, so Escape has an owner and the writer's next Tab
	// starts inside the drawer rather than behind it. `preventScroll`, because
	// focus lands while the drawer is still translated out of view, and a browser
	// reveals such an element by scrolling the box that clips it.
	useEffect(() => {
		if (open) panel.current?.focus({ preventScroll: true })
	}, [open])

	return (
		<div
			ref={panel}
			aria-label="All Notes"
			className={cx(
				'absolute inset-x-0 bottom-0 flex max-h-[85%] flex-col rounded-t-frame border-t border-edge bg-surface shadow-drawer outline-none',
				'transition-transform duration-200 ease-out motion-reduce:transition-none',
				open ? 'translate-y-0' : 'translate-y-full',
				className,
			)}
			// Not modal: the composer below stays live, so the writer can ask for the
			// next Review with the record open.
			inert={!open}
			onKeyDown={(event) => {
				if (event.key === 'Escape') onClose()
			}}
			role="group"
			tabIndex={-1}
		>
			{/* Title and close share a row and the count takes its own, rather than
			    three things competing for one line: this Panel is the narrowest
			    column in the row. */}
			<div className="shrink-0 rounded-t-frame border-b border-edge bg-sunk px-3.5 py-2.5">
				<div className="flex items-baseline gap-2.5">
					<h3 className="text-14 font-semibold text-ink">All Notes</h3>
					<button
						className="ml-auto shrink-0 text-12 text-faint hover:text-ink"
						onClick={onClose}
						type="button"
					>
						close ×
					</button>
				</div>
				<p className="label-meta">{summary(ledger)}</p>
			</div>

			<div className="flex min-h-0 flex-col gap-3.5 overflow-y-auto p-3.5">
				{ledger.rounds.map((one) => (
					<RoundBlock key={one.round.id} actions={actions} naming={naming} round={one} />
				))}

				{ledger.rounds.length === 0 ? <EmptySlot>No Notes yet</EmptySlot> : null}
			</div>
		</div>
	)
}

/** What is left to do, first. A writer opening this wants that number rather
 * than the total, so the total comes after it. */
function summary(ledger: NotesLedger): string {
	const { proposed, accepted, all } = ledger.counts
	const left = [
		proposed === 0 ? null : `${proposed} to rule`,
		accepted === 0 ? null : `${accepted} to do`,
	].filter((part) => part !== null)

	return left.length === 0
		? `${all} · all settled`
		: `${left.join(' · ')} · ${all} in all`
}

/** One Round's Notes under its own heading. */
function RoundBlock({
	round,
	naming,
	actions,
}: {
	round: LedgerRound
	naming: AnchorNaming
	actions: NoteActions
}) {
	// Which settled Notes the writer has opened back up, and whether the declined
	// pile is showing. Held here so it survives scrolling and resets per Round.
	const [opened, setOpened] = useState<ReadonlySet<string>>(new Set())
	const [showDeclined, setShowDeclined] = useState(false)

	const open = (note: Note) => setOpened((held) => new Set(held).add(note.id))

	const settled = (note: Note) =>
		opened.has(note.id) ? (
			<NoteCard key={note.id} actions={actions} naming={naming} note={note} />
		) : (
			<NoteLine key={note.id} naming={naming} note={note} onOpen={() => open(note)} />
		)

	return (
		<section className="flex flex-col gap-2">
			<p className="label-meta">
				Round {round.round.ordinal} · {dateAndTime(round.round.startedAt)}
			</p>

			{round.proposed.map((note) => (
				<NoteCard key={note.id} actions={actions} naming={naming} note={note} />
			))}

			{round.accepted.map(settled)}
			{round.resolved.map(settled)}

			{round.declined.length === 0 ? null : showDeclined ? (
				round.declined.map(settled)
			) : (
				<Button
					className="self-start"
					onClick={() => setShowDeclined(true)}
					size="sm"
					variant="link"
				>
					{round.declined.length} declined
				</Button>
			)}
		</section>
	)
}
