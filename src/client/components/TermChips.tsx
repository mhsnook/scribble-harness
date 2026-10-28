import { type ReactNode, useState } from 'react'

import { Chip } from './Chip'
import { InlineInput } from './Field'

/**
 * A list of short terms the writer adds by typing and Enter, and drops with
 * the × on each chip — the Adjectives at a Scope, the subjects a favourite is
 * trusted on.
 */

export interface TermChipsProps {
	terms: string[]
	onTerms: (terms: string[]) => void
	/** Names the add field for a screen reader: "Add an Adjective to the House". */
	addLabel: string
	/** Names one chip's remove button for a screen reader. */
	removeLabel: (term: string) => string
	placeholder: string
	/** Chips drawn ahead of the writer's own, which they cannot remove here —
	 * the Adjectives a Scope inherits. */
	leading?: ReactNode
}

export function TermChips({
	terms,
	onTerms,
	addLabel,
	removeLabel,
	placeholder,
	leading,
}: TermChipsProps) {
	const [adding, setAdding] = useState('')

	const add = () => {
		const term = adding.trim()
		setAdding('')
		if (term === '' || terms.includes(term)) return

		onTerms([...terms, term])
	}

	return (
		<div className="flex flex-wrap items-center gap-1.5">
			{leading}
			{terms.map((term) => (
				<Chip key={term}>
					{term}
					<button
						aria-label={removeLabel(term)}
						className="text-faint hover:text-ink"
						onClick={() => onTerms(terms.filter((held) => held !== term))}
						type="button"
					>
						×
					</button>
				</Chip>
			))}
			<InlineInput
				className="w-24 text-11"
				label={addLabel}
				onChange={setAdding}
				onKeyDown={(event) => {
					if (event.key !== 'Enter') return
					event.preventDefault()
					add()
				}}
				placeholder={placeholder}
				value={adding}
			/>
		</div>
	)
}
