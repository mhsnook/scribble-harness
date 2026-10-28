import type { ResolvedScope } from '../../shared/plan'
import { Chip } from '../components/Chip'
import { FieldRow, TextField } from '../components/Field'
import { TermChips } from '../components/TermChips'
import { cx } from '../lib/cx'

/**
 * The Tone at one Scope: its Voice and its Adjectives. One Voice applies at a
 * time and the nearest Scope wins outright, while Adjectives accumulate — so
 * what this Scope states is editable here, and what it inherits is shown
 * beside it, dimmed, and edited where it was said. Resolution runs at read
 * time, and nothing here stores a resolved value — `docs/plan.md`.
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
	const inherited = voice === null ? resolved.voice : null
	const inheritedAdjectives = resolved.adjectives.filter(
		(adjective) => !adjectives.includes(adjective),
	)

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
				<TermChips
					addLabel={`Add an Adjective to ${scopeName}`}
					leading={inheritedAdjectives.map((adjective) => (
						<Chip key={adjective} dimmed title="inherited" variant="outline">
							{adjective}
						</Chip>
					))}
					onTerms={onAdjectives}
					placeholder="+ adjective"
					removeLabel={(adjective) => `Remove ${adjective} from ${scopeName}`}
					terms={adjectives}
				/>
			</FieldRow>
		</div>
	)
}
