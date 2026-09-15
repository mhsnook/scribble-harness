import { type RefObject, useRef, useState } from 'react'

import { Button } from '../components/Button'
import type { PanelProps } from '../components/Panel'
import { NotesLedgerDrawer } from './NotesLedgerDrawer'
import { NotesPanel } from './NotesPanel'
import { useSkills } from './skills'
import { useNotes } from './useNotes'

/** Drives the Notes Panel from the Article Agent, the same split as
 * `ArticlePlanPanel` and `ArticleChatPanel`. */

export interface ArticleNotesPanelProps {
	divider?: PanelProps['divider']
	/** This Panel's share of the Panel row — `panelShare`. */
	grow?: PanelProps['grow']
	className?: string
}

export function ArticleNotesPanel({ divider, grow, className }: ArticleNotesPanelProps) {
	const notes = useNotes()
	const skills = useSkills()

	/**
	 * Which Round is on screen. `null` is not "none" — it is "whichever is
	 * newest", so a Review the writer starts takes the screen the moment its row
	 * arrives, rather than leaving them reading the Round before it.
	 */
	const [pinnedId, setPinnedId] = useState<string | null>(null)
	const [showLedger, setShowLedger] = useState(false)
	const toggle = useRef<HTMLButtonElement>(null)

	const newest = notes.rounds[notes.rounds.length - 1] ?? null
	const round = notes.rounds.find((one) => one.id === pinnedId) ?? newest

	const close = () => {
		setShowLedger(false)
		toggle.current?.focus()
	}

	return (
		<NotesPanel
			actions={notes.actions}
			className={className}
			divider={divider}
			drawer={
				<NotesLedgerDrawer
					actions={notes.actions}
					ledger={notes.ledger}
					naming={notes.naming}
					onClose={close}
					open={showLedger}
				/>
			}
			failure={notes.failure}
			grow={grow}
			ledgerToggle={
				<LedgerToggle
					onToggle={() => (showLedger ? close() : setShowLedger(true))}
					open={showLedger}
					ref={toggle}
					owed={notes.owed}
				/>
			}
			loading={notes.loading}
			naming={notes.naming}
			notes={notes.notes}
			onPick={setPinnedId}
			onRun={(prompt, depth) => {
				// Back to following, so the Round this starts is the one on screen.
				setPinnedId(null)
				notes.runReview(prompt, depth)
			}}
			onSaveSkill={(name) =>
				round === null ? undefined : skills.save({ name, prompt: round.prompt })
			}
			round={round}
			rounds={notes.rounds}
			skills={skills.skills}
		/>
	)
}

/** Opens and closes the ledger. Sits in the composer, which the drawer leaves
 * uncovered, so it is in one place for both. */
function LedgerToggle({
	onToggle,
	open,
	ref,
	owed,
}: {
	onToggle: () => void
	open: boolean
	ref: RefObject<HTMLButtonElement | null>
	owed: number
}) {
	return (
		<Button
			aria-expanded={open}
			aria-label={owed === 0 ? 'All Notes' : `All Notes, ${owed} still owed`}
			onClick={onToggle}
			pressed={open}
			ref={ref}
			size="sm"
			variant="quiet"
		>
			all notes{owed === 0 ? '' : ` · ${owed}`}
		</Button>
	)
}
