import { useState } from 'react'

import type { ResolvedScope } from '../../shared/plan'
import { Chip } from '../components/Chip'
import { FieldRow, InlineInput, TextField } from '../components/Field'
import { cx } from '../lib/cx'

/**
 * The Tone at one Scope: its Voice and its Adjectives. One Voice applies at a
 * time and the nearest Scope wins outright, while Adjectives accumulate — so
 * what this Scope states is editable here, and what it inherits is shown
 * beside it, dimmed, and edited where it was said. Resolution runs at read
 * time, and nothing here stores a resolved value — docs/architecture.md §4.
 */

export interface ToneFieldsProps {
	/** Names the Scope for a screen reader: "the Article", "Section 2". */
	scopeName: string
	/** What this Scope states, against `resolved`, which is what applies. */
	voice: string | null
	adjectives: string[]
	resolved: ResolvedScope
	onVoice: (voice: string | null) => void
	onAdjectives: (adjectives: string[]) => void
	className?: string
}

export function ToneFields({
	scopeName,
	voice,
	adjectives,
	resolved,
	onVoice,
	onAdjectives,
	className,
}: ToneFieldsProps) {
	const [adding, setAdding] = useState('')

	const inherited = voice === null ? resolved.voice : null
	const inheritedAdjectives = resolved.adjectives.filter(
		(adjective) => !adjectives.includes(adjective),
	)

	const add = () => {
		const adjective = adding.trim()
		setAdding('')
		if (adjective === '' || adjectives.includes(adjective)) return

		onAdjectives([...adjectives, adjective])
	}

	// `FieldRow` puts both labels in the same gutter every other minor field
	// uses, so Voice and Adjectives line up with the References beneath them.
	return (
		<div className={cx('flex flex-col gap-1.5', className)}>
			<FieldRow label="Voice">
				<TextField
					hiddenLabel={`Voice for ${scopeName}`}
					onChange={(typed) => onVoice(typed.trim() === '' ? null : typed)}
					placeholder={inherited === null ? 'no Voice set' : `${inherited}, inherited`}
					size="sm"
					value={voice ?? ''}
				/>
			</FieldRow>

			<FieldRow label="Adjectives">
				<div className="flex flex-wrap items-center gap-1.5">
					{inheritedAdjectives.map((adjective) => (
						<Chip key={adjective} dimmed title="inherited" variant="outline">
							{adjective}
						</Chip>
					))}
					{adjectives.map((adjective) => (
						<Chip key={adjective}>
							{adjective}
							<button
								aria-label={`Remove ${adjective} from ${scopeName}`}
								className="text-faint hover:text-ink"
								onClick={() =>
									onAdjectives(adjectives.filter((held) => held !== adjective))
								}
								type="button"
							>
								×
							</button>
						</Chip>
					))}
					<InlineInput
						className="w-24 text-11"
						label={`Add an Adjective to ${scopeName}`}
						onChange={setAdding}
						onKeyDown={(event) => {
							if (event.key !== 'Enter') return
							event.preventDefault()
							add()
						}}
						placeholder="+ adjective"
						value={adding}
					/>
				</div>
			</FieldRow>
		</div>
	)
}
