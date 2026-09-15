import type { ReactNode } from 'react'

import type { Note } from '../../shared/note'
import type { ReviewDepth, Round } from '../../shared/review'
import { Notice } from '../components/Notice'
import { Panel, type PanelProps } from '../components/Panel'
import type { NoteActions } from './actions'
import type { AnchorNaming } from './anchors'
import { ReviewComposer } from './ReviewComposer'
import { RoundView } from './RoundView'
import type { Skill } from './skills'

/**
 * The Notes Panel — one Round at a time, with the whole record a drawer away.
 *
 * **It reads like the Chat Panel, because it works like it.** An ask makes a
 * Round the way a message makes a turn, and the Panel shows the newest one. The
 * writer rules on what that Round found; the Notes they accepted and have not
 * resolved are still owed, and the ledger is where they are all kept.
 *
 * Which Round is on screen and whether the ledger is open are
 * `ArticleNotesPanel`'s, the same split as `PlanPanel` and `ChatPanel`.
 */

export interface NotesPanelProps {
	/** Every Round, oldest first. Which one is running is read off this. */
	rounds: readonly Round[]
	/** The Round on screen, or null before any Review has run. */
	round: Round | null
	/** The Round on screen is the newest because the Panel follows, not because
	 * the writer picked it. */
	following: boolean
	/** Every Note on the Article. A passage names its own by id. */
	notes: readonly Note[]
	loading: boolean
	failure: string | null
	naming: AnchorNaming
	actions: NoteActions
	skills: readonly Skill[]
	onRun: (prompt: string, depth: ReviewDepth) => void
	onPick: (roundId: string | null) => void
	onSaveSkill: (name: string) => void
	/** Opens and closes the ledger — sits left of `run review`. */
	ledgerToggle: ReactNode
	/** The ledger itself, drawn over the Round and stopping at the composer. */
	drawer: ReactNode
	divider?: PanelProps['divider']
	/** This Panel's share of the Panel row — `panelShare`. */
	grow?: PanelProps['grow']
	className?: string
}

export function NotesPanel({
	rounds,
	round,
	following,
	notes,
	loading,
	failure,
	naming,
	actions,
	skills,
	onRun,
	onPick,
	onSaveSkill,
	ledgerToggle,
	drawer,
	divider,
	grow,
	className,
}: NotesPanelProps) {
	const running = rounds.some((one) => one.state === 'running')

	return (
		<Panel
			className={className}
			divider={divider}
			grow={grow}
			padded={false}
			variant="sunk"
		>
			{/* The Round and the drawer share this box, so the drawer covers what
			    the writer is reading and stops at the composer. `overflow-hidden` is
			    what keeps it out of sight when it is closed. */}
			<div className="relative flex min-h-0 flex-1 overflow-hidden">
				<div
					className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto p-3.5"
					data-scroller=""
				>
					{failure === null ? null : <Notice>{failure}</Notice>}

					{round === null ? (
						<FirstRound loading={loading} />
					) : (
						<RoundView
							actions={actions}
							following={following}
							naming={naming}
							notes={notes}
							onPick={onPick}
							onRunAgain={() => onRun(round.prompt, round.depth)}
							onSaveSkill={onSaveSkill}
							round={round}
							rounds={rounds}
						/>
					)}
				</div>

				{drawer}
			</div>

			<ReviewComposer
				leading={ledgerToggle}
				onRun={onRun}
				running={running}
				skills={skills}
			/>
		</Panel>
	)
}

/** Loading and empty are told apart rather than both drawing nothing —
 * `docs/ui.md`. */
function FirstRound({ loading }: { loading: boolean }) {
	return (
		<p className="text-12 leading-relaxed text-faint">
			{loading
				? 'Opening the Notes…'
				: 'No Reviews yet. Say what this one should look for, and the Guide reads the Draft against the Plan.'}
		</p>
	)
}
