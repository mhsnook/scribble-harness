import { useEffect, useRef, useState } from 'react'

import type { NoteDisposition } from '../../shared/note'
import {
	countRounds,
	DISPOSITIONS,
	EVERYTHING,
	filterRounds,
	type LedgerFilter,
	type LedgerRound,
	type NotesLedger,
} from '../../shared/notes-ledger'
import { Chip } from '../components/Chip'
import { EmptySlot } from '../components/Field'
import { PanelHeader } from '../components/Panel'
import { cx } from '../lib/cx'
import { dateAndTime } from '../lib/when'
import type { NoteActions } from './actions'
import type { AnchorNaming } from './anchors'
import { GradedNote } from './NoteCard'

/**
 * Every Note on the Article, newest Round first, in a drawer over the Round the
 * Panel is showing. The sibling of `OfferLedgerDrawer`, down to leaving the
 * composer uncovered so the control that opened it is the control that closes
 * it.
 *
 * Two things decide what a Note looks like here, and they are separate. The
 * filter decides whether it is on screen at all, and the writer sets that. Its
 * disposition decides how much room it takes, and the writer has already said
 * that by ruling on it — a Note they still owe a ruling gets a card, and one
 * they have ruled on gets a line they can open.
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
	const [filter, setFilter] = useState<LedgerFilter>(EVERYTHING)
	const [showFilters, setShowFilters] = useState(false)

	// Focus moves in on open, so Escape has an owner and the writer's next Tab
	// starts inside the drawer rather than behind it. `preventScroll`, because
	// focus lands while the drawer is still translated out of view, and a browser
	// reveals such an element by scrolling the box that clips it.
	useEffect(() => {
		if (open) panel.current?.focus({ preventScroll: true })
	}, [open])

	const showing = filterRounds(ledger.rounds, filter)

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
			{/* The filters fold away. Five controls at this Panel's width need four
			    rows, and the drawer is opened to read the record rather than to
			    narrow it — left open they would push the list off the bottom. */}
			<div className="flex shrink-0 flex-col gap-1.5 rounded-t-frame border-b border-edge bg-sunk px-3.5 py-2.5">
				<PanelHeader
					actions={
						<>
							<button
								aria-expanded={showFilters}
								className="text-12 text-faint hover:text-ink"
								onClick={() => setShowFilters((held) => !held)}
								type="button"
							>
								filters
							</button>
							<button
								className="text-12 text-faint hover:text-ink"
								onClick={onClose}
								type="button"
							>
								close ×
							</button>
						</>
					}
					title="All Notes"
				/>

				{/* On its own line rather than on the toggle: three labels in this
				    Panel's header wrap, and a count the writer cannot read is worse
				    than a row. Kept while the filters are folded, which is when they
				    cannot say it themselves. */}
				{narrowed(filter) ? (
					<p className="label-meta">
						{`showing ${countRounds(showing)} of ${countRounds(ledger.rounds)}`}
					</p>
				) : null}

				{showFilters ? (
					<>
						<RoundFilter ledger={ledger} onPick={setFilter} roundId={filter.roundId} />

						<div className="flex flex-wrap items-center gap-1.5">
							<DispositionFilters
								counts={ledger.counts}
								onSet={setFilter}
								showing={filter.dispositions}
							/>
						</div>
					</>
				) : null}
			</div>

			<div className="flex min-h-0 flex-col gap-3.5 overflow-y-auto p-3.5">
				{showing.map((one) => (
					<RoundBlock key={one.round.id} actions={actions} naming={naming} round={one} />
				))}

				{showing.length === 0 ? (
					<EmptySlot>
						{ledger.counts.all === 0 ? 'No Notes yet' : 'No Notes match these filters'}
					</EmptySlot>
				) : null}
			</div>
		</div>
	)
}

/**
 * Whether the writer has narrowed the list.
 *
 * Read off the filter rather than by comparing what is on screen against the
 * total. A Note whose Round has not synced yet is counted and not listed, and
 * comparing the two numbers would read that as a filter the writer never set.
 */
function narrowed(filter: LedgerFilter): boolean {
	return filter.roundId !== null || filter.dispositions.size < DISPOSITIONS.length
}

/**
 * One chip per disposition, each saying how many Notes it would bring back.
 *
 * A chip turns its own disposition on and off, and the count on it is the whole
 * ledger's rather than the filtered list's — a control that hides a thing has
 * to keep saying what it is hiding. Turning the last one off turns them all
 * back on, because an empty list is never what the writer meant by it.
 */
function DispositionFilters({
	counts,
	showing,
	onSet,
}: {
	counts: NotesLedger['counts']
	showing: ReadonlySet<NoteDisposition>
	onSet: (change: (held: LedgerFilter) => LedgerFilter) => void
}) {
	const toggle = (disposition: NoteDisposition) =>
		onSet((held) => {
			const next = new Set(held.dispositions)
			if (!next.delete(disposition)) next.add(disposition)

			return {
				...held,
				dispositions: next.size === 0 ? new Set(DISPOSITIONS) : next,
			}
		})

	return (
		<>
			{DISPOSITIONS.map((disposition) => {
				const on = showing.has(disposition)

				return (
					<Chip
						aria-label={`${disposition}, ${counts[disposition]} — ${on ? 'showing' : 'hidden'}`}
						aria-pressed={on}
						interactive
						key={disposition}
						onClick={() => toggle(disposition)}
						variant={on ? 'solid' : 'outline'}
					>
						{disposition} · {counts[disposition]}
					</Chip>
				)
			})}
		</>
	)
}

/** One Round, or all of them. Only the Rounds that wrote a Note are offered:
 * `notesLedger` leaves the rest out, and picking one would show nothing. */
function RoundFilter({
	ledger,
	roundId,
	onPick,
}: {
	ledger: NotesLedger
	roundId: string | null
	onPick: (change: (held: LedgerFilter) => LedgerFilter) => void
}) {
	return (
		<select
			aria-label="Which Round to show"
			className="w-full min-w-0 rounded-full border border-edge bg-surface px-2.5 py-1 text-12 text-ink"
			onChange={(event) =>
				onPick((held) => ({
					...held,
					roundId: event.target.value === '' ? null : event.target.value,
				}))
			}
			value={roundId ?? ''}
		>
			<option value="">All rounds</option>
			{ledger.rounds.map((one) => (
				<option key={one.round.id} value={one.round.id}>
					Round {one.round.ordinal} · {dateAndTime(one.round.startedAt)}
				</option>
			))}
		</select>
	)
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
	const notes = [
		...round.proposed,
		...round.accepted,
		...round.resolved,
		...round.declined,
	]

	return (
		<section className="flex flex-col gap-2">
			<p className="label-meta">
				Round {round.round.ordinal} · {dateAndTime(round.round.startedAt)}
			</p>

			{notes.map((note) => (
				<GradedNote key={note.id} actions={actions} naming={naming} note={note} />
			))}
		</section>
	)
}
