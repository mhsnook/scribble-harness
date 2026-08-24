import type { NotesQueue, QueueView } from '../../shared/notes-queue'
import type { ReviewDepth, Round } from '../../shared/review'
import { Button } from '../components/Button'
import { Chip } from '../components/Chip'
import { Notice } from '../components/Notice'
import { Panel, PanelHeader, type PanelProps } from '../components/Panel'
import { dateAndTime } from '../lib/when'
import type { NoteActions } from './actions'
import type { AnchorNaming } from './anchors'
import { NoteCard } from './NoteCard'
import { ReviewComposer } from './ReviewComposer'
import type { Skill } from './skills'

/**
 * The Notes Panel — the Round's written response, flattened into a queue.
 *
 * `ArticleNotesPanel` drives it from the Article Agent, the same split as
 * `PlanPanel` and `ChatPanel`. Every Round's Notes sit in one list rather than
 * only the last Review's: a Note accepted three Rounds ago is still owed, and a
 * Review that turns up nothing new should not clear the list.
 *
 * Ruling here and ruling inside the response are the same act, because both
 * draw the same rows.
 */

export interface NotesPanelProps {
	queue: NotesQueue
	/** Every Round, oldest first. Which one is running and which was the last to
	 * finish are read off this rather than passed beside it. */
	rounds: readonly Round[]
	loading: boolean
	failure: string | null
	view: QueueView
	onView: (view: QueueView) => void
	naming: AnchorNaming
	actions: NoteActions
	skills: readonly Skill[]
	onRun: (prompt: string, depth: ReviewDepth) => void
	/** Opens one Round's written response, which is where the reasoning is. */
	onRead: (round: Round) => void
	divider?: PanelProps['divider']
	/** This Panel's share of the Panel row — `panelShare`. */
	grow?: PanelProps['grow']
	className?: string
}

export function NotesPanel({
	queue,
	rounds,
	loading,
	failure,
	view,
	onView,
	naming,
	actions,
	skills,
	onRun,
	onRead,
	divider,
	grow,
	className,
}: NotesPanelProps) {
	const running = rounds.find((round) => round.state === 'running') ?? null
	const latest = [...rounds].reverse().find((round) => round.state === 'done') ?? null

	// Only the last Round can still be failed-and-unanswered: running one again
	// is the way past a failure, and that puts a newer Round after it.
	const last = rounds.length === 0 ? null : rounds[rounds.length - 1]
	const failed = last !== null && last.state === 'failed' ? last : null

	return (
		<Panel
			className={className}
			divider={divider}
			grow={grow}
			padded={false}
			variant="sunk"
		>
			<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
				<div
					className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto p-3.5"
					data-scroller=""
				>
					<PanelHeader
						meta={queue.counts.all === 0 ? undefined : `${queue.counts.accepted} open`}
						title="Notes"
					/>

					<div className="flex flex-wrap items-center gap-1.5">
						<Chip
							interactive
							onClick={() => onView({ ...view, acceptedOnly: !view.acceptedOnly })}
							variant={view.acceptedOnly ? 'solid' : 'outline'}
						>
							accepted only
						</Chip>
						<Chip
							interactive
							onClick={() => onView({ ...view, showResolved: !view.showResolved })}
							variant={view.showResolved ? 'solid' : 'outline'}
						>
							show resolved
						</Chip>
					</div>

					{latest === null ? null : (
						<button
							className="flex items-baseline gap-2 rounded-md border border-edge bg-surface px-2.5 py-1.5 text-left hover:border-ink/30"
							onClick={() => onRead(latest)}
							type="button"
						>
							<span className="text-12 text-ink">Round {latest.ordinal}</span>
							<span className="label-meta">{dateAndTime(latest.startedAt)}</span>
							<span className="ml-auto text-12 text-muted">read →</span>
						</button>
					)}

					{failure === null ? null : <Notice>{failure}</Notice>}

					{failed === null ? null : (
						<Notice>
							<span className="flex flex-col items-start gap-2">
								<span>
									Round {failed.ordinal} did not finish.{' '}
									{failed.failure ?? 'No reason was recorded.'}
								</span>
								<Button onClick={() => onRun(failed.prompt, failed.depth)} size="sm">
									run again
								</Button>
							</span>
						</Notice>
					)}

					{running === null ? null : (
						<p className="text-12 leading-relaxed text-faint">
							Round {running.ordinal} is reading the Draft. It carries on if you close
							this — come back and the findings will be here.
						</p>
					)}

					<Queue
						loading={loading}
						naming={naming}
						queue={queue}
						rounds={rounds}
						actions={actions}
						view={view}
					/>
				</div>

				<ReviewComposer onRun={onRun} running={running !== null} skills={skills} />
			</div>
		</Panel>
	)
}

/** The list, and what stands in for it when there is none. Loading and empty
 * are told apart rather than both drawing nothing — §8. */
function Queue({
	queue,
	view,
	loading,
	naming,
	actions,
	rounds,
}: Pick<
	NotesPanelProps,
	'queue' | 'view' | 'loading' | 'naming' | 'actions' | 'rounds'
>) {
	if (loading) {
		return <p className="text-12 text-faint">Opening the Notes…</p>
	}

	if (queue.counts.all === 0) {
		if (rounds.length === 0) {
			return (
				<p className="text-12 leading-relaxed text-faint">
					No Reviews yet. Say what this one should look for, and the Guide reads the Draft
					against the Plan.
				</p>
			)
		}

		// A running or failed Round says its own piece above the queue.
		if (!rounds.some((round) => round.state === 'done')) return null

		return (
			<p className="text-12 leading-relaxed text-faint">
				No Notes from these Reviews. The reasoning is in the written response.
			</p>
		)
	}

	if (queue.visible.length === 0) {
		return (
			<p className="text-12 leading-relaxed text-faint">
				{view.acceptedOnly
					? 'No Notes accepted yet.'
					: `${queue.counts.resolved} Notes, all resolved.`}
			</p>
		)
	}

	return (
		<div className="flex flex-col gap-2">
			{queue.visible.map((note, index) => (
				<NoteCard
					key={note.id}
					naming={naming}
					note={note}
					ordinal={index + 1}
					actions={actions}
				/>
			))}
		</div>
	)
}
