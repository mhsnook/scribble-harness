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
 * The filter decides which Notes are on screen; each Note's disposition decides
 * whether it draws as a card or a line.
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
			{/* The filters fold away: five controls at this Panel's width take four
			    rows, which measured 219px of header over a 191px drawer. */}
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

				{/* Its own line rather than text on the toggle: three labels in this
				    Panel's header wrap. */}
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
 * Read off the filter, not by comparing what is on screen against the total.
 * A Note whose Round has not synced yet is counted and not listed, so those two
 * numbers differ with no filter set.
 */
function narrowed(filter: LedgerFilter): boolean {
	return filter.roundId !== null || filter.dispositions.size < DISPOSITIONS.length
}

/**
 * One chip per disposition, which turns that disposition on and off.
 *
 * The count on a chip is the whole ledger's, not the filtered list's, so it
 * still reads when the chip is off. Turning the last chip off turns them all
 * back on: an empty `dispositions` set shows nothing at all.
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
