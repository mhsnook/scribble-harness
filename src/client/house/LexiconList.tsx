import { useState } from 'react'

import type { LexiconEntry } from '../../shared/house'
import { Button } from '../components/Button'
import { GroupHeading } from '../components/Divider'
import { EmptySlot, TextField } from '../components/Field'
import type { LexiconDraft } from './useHouse'

/**
 * The Lexicon — the writer's own terms and what they mean by them. A term
 * reaches the Guide's context whenever the piece invokes it, so the definition
 * is written for the Guide to read rather than as a private note.
 */

export interface LexiconListProps {
	entries: readonly LexiconEntry[]
	onAdd: (draft: LexiconDraft) => void
	onEdit: (id: string, draft: LexiconDraft) => void
	onRemove: (id: string) => void
}

export function LexiconList({ entries, onAdd, onEdit, onRemove }: LexiconListProps) {
	const [term, setTerm] = useState('')
	const [definition, setDefinition] = useState('')

	const ready = term.trim() !== '' && definition.trim() !== ''

	const add = () => {
		if (!ready) return

		onAdd({ term: term.trim(), definition: definition.trim() })
		setTerm('')
		setDefinition('')
	}

	return (
		<div className="flex flex-col gap-3">
			<GroupHeading count={entries.length}>Lexicon</GroupHeading>

			{entries.length === 0 ? (
				<EmptySlot>
					No terms yet. A term you define here reaches the guide whenever a piece uses it.
				</EmptySlot>
			) : (
				<ul className="flex flex-col gap-3">
					{entries.map((entry) => (
						<EntryRow
							entry={entry}
							key={entry.id}
							onEdit={(draft) => onEdit(entry.id, draft)}
							onRemove={() => onRemove(entry.id)}
						/>
					))}
				</ul>
			)}

			<div className="flex flex-col gap-1.5 rounded-md border border-dashed border-edge p-2.5">
				<TextField
					hiddenLabel="New term"
					label="Term"
					onChange={setTerm}
					onKeyDown={(event) => {
						if (event.key !== 'Enter') return
						event.preventDefault()
						add()
					}}
					placeholder="the Beat"
					size="sm"
					value={term}
				/>
				<TextField
					hiddenLabel="What the new term means"
					label="Means"
					onChange={setDefinition}
					placeholder="A subject I cover over time, and the research I have built up on it."
					rows={2}
					value={definition}
				/>
				<div className="flex justify-end">
					<Button disabled={!ready} onClick={add} size="sm">
						+ add term
					</Button>
				</div>
			</div>
		</div>
	)
}

interface EntryRowProps {
	entry: LexiconEntry
	onEdit: (draft: LexiconDraft) => void
	onRemove: () => void
}

/**
 * One entry, edited in place. The fields hold what the writer is typing and
 * write it once they leave, rather than on every keystroke: a keystroke here is
 * a POST and a round trip through the room, where a Plan keystroke is a
 * debounced blob write.
 */
function EntryRow({ entry, onEdit, onRemove }: EntryRowProps) {
	const [term, setTerm] = useState(entry.term)
	const [definition, setDefinition] = useState(entry.definition)

	const commit = () => {
		const next = { term: term.trim(), definition: definition.trim() }
		if (next.term === '' || next.definition === '') {
			setTerm(entry.term)
			setDefinition(entry.definition)

			return
		}
		if (next.term === entry.term && next.definition === entry.definition) return

		onEdit(next)
	}

	return (
		<li className="flex flex-col gap-1.5 border-b border-rule pb-3 last:border-b-0">
			<div className="flex items-center gap-2">
				<TextField
					className="flex-1"
					hiddenLabel={`Term: ${entry.term}`}
					label="Term"
					onBlur={commit}
					onChange={setTerm}
					size="sm"
					value={term}
				/>
				<Button
					aria-label={`Delete ${entry.term}`}
					onClick={onRemove}
					size="sm"
					variant="quiet"
				>
					delete
				</Button>
			</div>
			<TextField
				hiddenLabel={`What ${entry.term} means`}
				label="Means"
				onBlur={commit}
				onChange={setDefinition}
				rows={2}
				value={definition}
			/>
		</li>
	)
}
