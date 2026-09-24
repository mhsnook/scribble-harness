import { useState } from 'react'

import type { Note } from '../../shared/note'
import type { Round, RoundPassage } from '../../shared/review'
import { Button } from '../components/Button'
import { TextField } from '../components/Field'
import { MetaLabel } from '../components/MetaLabel'
import { Notice } from '../components/Notice'
import { cx } from '../lib/cx'
import { dateAndTime } from '../lib/when'
import type { NoteActions } from './actions'
import type { AnchorNaming } from './anchors'
import { GradedNote } from './NoteCard'

/**
 * One Round, read whole: what the writer asked, the Guide's prose, and the
 * Notes each passage produced.
 *
 * This is the Notes Panel's own view, not a place it goes — the Panel shows the
 * newest Round the way the Chat shows the latest turn, and the picker in this
 * header is how the writer reads an earlier one. The whole record is the
 * ledger, which opens over this.
 */

export interface RoundViewProps {
	round: Round
	/** Every Note on the Article. A passage names its own by id. */
	notes: readonly Note[]
	/** Every Round, for the picker. */
	rounds: readonly Round[]
	naming: AnchorNaming
	actions: NoteActions
	/** Pins the Panel to one Round. The newest is picked by following rather
	 * than by id, so `null` means "whichever is newest". */
	onPick: (roundId: string | null) => void
	/** The Panel is showing the newest Round because it follows, rather than
	 * because the writer picked it. Decided by the container, which owns the
	 * pin. */
	following: boolean
	/** Runs this Round's ask again, which is the way past a failure. */
	onRunAgain: () => void
	onSaveSkill: (name: string) => void
	className?: string
}

export function RoundView({
	round,
	notes,
	rounds,
	naming,
	actions,
	onPick,
	following,
	onRunAgain,
	onSaveSkill,
	className,
}: RoundViewProps) {
	const byId = new Map(notes.map((note) => [note.id, note]))
	const newest = rounds[rounds.length - 1]

	return (
		<div className={cx('flex flex-col gap-2.5', className)}>
			<div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1.5">
				<h3 className="text-14 font-semibold text-ink">Notes</h3>
				<RoundPicker onPick={onPick} round={round} rounds={rounds} />
			</div>

			{following ? null : (
				<Button
					className="self-start"
					onClick={() => onPick(null)}
					size="sm"
					variant="link"
				>
					back to Round {newest?.ordinal}
				</Button>
			)}

			<TheAsk onSave={onSaveSkill} round={round} />

			{round.state === 'running' ? (
				<p className="text-13 leading-relaxed text-faint">
					Reading the Draft. This carries on if you leave — the findings will be here when
					you come back.
				</p>
			) : null}

			{round.state === 'failed' ? (
				<Notice>
					<span className="flex flex-col items-start gap-2">
						<span>
							This Review did not finish. {round.failure ?? 'No reason was recorded.'}
						</span>
						<Button onClick={onRunAgain} size="sm">
							run it again
						</Button>
					</span>
				</Notice>
			) : null}

			{round.passages.map((passage, index) => (
				<Passage
					actions={actions}
					byId={byId}
					key={index}
					naming={naming}
					passage={passage}
				/>
			))}

			{round.state === 'done' && round.passages.length === 0 ? (
				<p className="text-13 leading-relaxed text-faint">
					This Review turned up nothing to say.
				</p>
			) : null}

			{round.state === 'done' ? (
				<p className="label-meta border-t border-edge pt-3">
					bound by the Plan and the References in it — a Review proposes no new sources
				</p>
			) : null}
		</div>
	)
}

/**
 * Which Round is on screen, and the way back to an earlier one.
 *
 * Picking the newest passes `null` rather than its id, so the Panel goes back
 * to following. Pinning it by id would leave the writer behind the moment the
 * next Review started.
 */
function RoundPicker({
	round,
	rounds,
	onPick,
}: {
	round: Round
	rounds: readonly Round[]
	onPick: (roundId: string | null) => void
}) {
	const newest = rounds[rounds.length - 1]

	if (rounds.length < 2) {
		return (
			<span className="label-meta">
				Round {round.ordinal} · {dateAndTime(round.startedAt)}
			</span>
		)
	}

	return (
		<select
			aria-label="Which Round to read"
			className="ml-auto min-w-0 rounded-full border border-edge bg-surface px-2.5 py-1 text-12 text-ink"
			onChange={(event) =>
				onPick(event.target.value === newest?.id ? null : event.target.value)
			}
			value={round.id}
		>
			{[...rounds].reverse().map((one) => (
				<option key={one.id} value={one.id}>
					Round {one.ordinal} · {dateAndTime(one.startedAt)}
					{one.state === 'running' ? ' · running' : ''}
				</option>
			))}
		</select>
	)
}

/** What the writer asked for, and the control that keeps the prompt for next
 * time. */
function TheAsk({ round, onSave }: { round: Round; onSave: (name: string) => void }) {
	const [name, setName] = useState<string | null>(null)

	const save = () => {
		const named = name?.trim() ?? ''
		if (named === '') return

		onSave(named)
		setName(null)
	}

	return (
		<div className="flex flex-col gap-2 rounded-lg border border-edge bg-surface p-3">
			<MetaLabel>you asked · {round.depth}</MetaLabel>
			<p className="text-13 leading-relaxed whitespace-pre-wrap text-ink">
				{round.prompt}
			</p>

			{name === null ? (
				<Button className="self-start" onClick={() => setName('')} size="sm">
					save as review skill
				</Button>
			) : (
				<div className="flex items-center gap-2">
					<TextField
						className="flex-1"
						hiddenLabel="What to call this Skill"
						onChange={setName}
						onKeyDown={(event) => {
							if (event.key === 'Enter') save()
						}}
						placeholder="name it — repetition, verify sources…"
						size="sm"
						value={name}
					/>
					<Button disabled={name.trim() === ''} onClick={save} size="sm">
						save
					</Button>
					<Button onClick={() => setName(null)} size="sm" variant="quiet">
						cancel
					</Button>
				</div>
			)}
		</div>
	)
}

/**
 * One passage of the Guide's reasoning, and the Notes it produced.
 *
 * Keeps the Notes in the order the Guide wrote them, rather than grouping them
 * by disposition the way the ledger does, because that would move a Note the
 * moment it is ruled on and shift the rest of the list under the pointer.
 */
function Passage({
	passage,
	byId,
	naming,
	actions,
}: {
	passage: RoundPassage
	byId: ReadonlyMap<string, Note>
	naming: AnchorNaming
	actions: NoteActions
}) {
	// A row the response names and the store has not got means a read raced a
	// write, so the next read fixes it.
	const notes = passage.noteIds
		.map((id) => byId.get(id))
		.filter((one): one is Note => one !== undefined)

	const proposed = notes.filter((note) => note.disposition === 'proposed')

	return (
		<section className="flex flex-col gap-2.5">
			{passage.prose.split('\n\n').map((paragraph, index) => (
				<p className="text-13 leading-relaxed text-ink" key={index}>
					{paragraph}
				</p>
			))}

			{notes.length === 0 ? null : (
				<div className="flex flex-col gap-2 border-l-2 border-accent-edge pl-3">
					<div className="flex items-baseline gap-2.5">
						<MetaLabel count={notes.length}>{passage.label ?? 'notes'}</MetaLabel>

						{proposed.length === 0 ? null : (
							<div className="ml-auto flex items-center gap-1.5">
								<Button
									onClick={() => proposed.forEach(actions.accept)}
									size="sm"
									variant="link"
								>
									accept all
								</Button>
								<Button
									onClick={() => proposed.forEach(actions.decline)}
									size="sm"
									variant="link"
								>
									decline all
								</Button>
							</div>
						)}
					</div>

					{notes.map((note) => (
						<GradedNote key={note.id} actions={actions} naming={naming} note={note} />
					))}
				</div>
			)}
		</section>
	)
}
