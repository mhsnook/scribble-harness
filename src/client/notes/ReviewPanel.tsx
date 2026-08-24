import { useState } from 'react'

import type { Note } from '../../shared/note'
import type { Round, RoundPassage } from '../../shared/review'
import { Button } from '../components/Button'
import { TextField } from '../components/Field'
import { MetaLabel } from '../components/MetaLabel'
import { Notice } from '../components/Notice'
import { Panel, type PanelProps } from '../components/Panel'
import { dateAndTime } from '../lib/when'
import type { NoteActions } from './actions'
import type { AnchorNaming } from './anchors'
import { NoteCard } from './NoteCard'

/**
 * One Review, read whole — the Notes Panel showing a Round's response instead
 * of the queue. Same column, same width rules; close the other Panels to give
 * it the window.
 *
 * Ruling here and ruling in the queue are one write, because both draw the same
 * rows.
 */

export interface ReviewPanelProps {
	round: Round
	/** Every Note on the Article. A passage names its own by id. */
	notes: readonly Note[]
	/** For the history picker. */
	rounds: readonly Round[]
	naming: AnchorNaming
	actions: NoteActions
	onOpenRound: (round: Round) => void
	onBack: () => void
	onSaveSkill: (name: string) => void
	divider?: PanelProps['divider']
	grow?: PanelProps['grow']
	className?: string
}

export function ReviewPanel({
	round,
	notes,
	rounds,
	naming,
	actions,
	onOpenRound,
	onBack,
	onSaveSkill,
	divider,
	grow,
	className,
}: ReviewPanelProps) {
	const byId = new Map(notes.map((note) => [note.id, note]))

	return (
		<Panel className={className} divider={divider} grow={grow} variant="sunk">
			<div className="flex items-baseline gap-2.5">
				<h3 className="text-14 font-semibold text-ink">Round {round.ordinal}</h3>
				<span className="label-meta">{dateAndTime(round.startedAt)}</span>

				<div className="ml-auto flex items-center gap-2">
					{rounds.length < 2 ? null : (
						<select
							aria-label="Earlier Rounds"
							className="rounded-full border border-edge bg-surface px-2.5 py-1 text-12 text-ink"
							onChange={(event) => {
								const picked = rounds.find((one) => one.id === event.target.value)
								if (picked !== undefined) onOpenRound(picked)
							}}
							value={round.id}
						>
							{[...rounds].reverse().map((one) => (
								<option key={one.id} value={one.id}>
									Round {one.ordinal} · {dateAndTime(one.startedAt)}
								</option>
							))}
						</select>
					)}
					<Button onClick={onBack} size="sm">
						← notes
					</Button>
				</div>
			</div>

			<TheAsk onSave={onSaveSkill} round={round} />

			{round.state === 'running' ? (
				<p className="text-13 leading-relaxed text-faint">
					Reading the Draft. This carries on if you leave — the findings will be here when
					you come back.
				</p>
			) : null}

			{round.state === 'failed' ? (
				<Notice>
					This Review did not finish. {round.failure ?? 'No reason was recorded.'}
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

			{round.state === 'done' ? (
				<p className="label-meta border-t border-edge pt-3">
					bound by the Plan and the References in it — a Review proposes no new sources
				</p>
			) : null}
		</Panel>
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

/** One passage of the Guide's reasoning, and the Notes it produced. */
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
	// write; the next read fixes it.
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
						<NoteCard actions={actions} key={note.id} naming={naming} note={note} />
					))}
				</div>
			)}
		</section>
	)
}
