import { useState } from 'react'

import type { OutlineNode } from '../../shared/plan'
import { Button, ButtonGroup } from '../components/Button'
import type { SectionAnchor } from './edits'

/**
 * Making a Section, and saying where it goes. It asks rather than appending,
 * because a new Section usually belongs somewhere other than wherever the
 * button happens to sit.
 *
 * Subsections are TBD, so every choice here anchors at the top level.
 */

export interface AddSectionProps {
	outline: readonly OutlineNode[]
	onAdd: (anchor: SectionAnchor) => void
}

export function AddSection({ outline, onAdd }: AddSectionProps) {
	const [asking, setAsking] = useState(false)

	const add = (anchor: SectionAnchor) => {
		setAsking(false)
		onAdd(anchor)
	}

	// With nothing in the Outline there is nowhere else to put it.
	if (outline.length === 0) {
		return (
			<Button onClick={() => add({ parentId: null, beforeId: null })} size="sm">
				+ section
			</Button>
		)
	}

	if (!asking) {
		return (
			<Button onClick={() => setAsking(true)} size="sm">
				+ section
			</Button>
		)
	}

	return (
		<div
			className="flex flex-col items-start gap-2 rounded-md border border-edge bg-surface p-2.5"
			onKeyDown={(event) => {
				if (event.key === 'Escape') setAsking(false)
			}}
		>
			<p className="label-meta text-muted">New section: where?</p>

			<ButtonGroup label="Where the Section goes">
				<Button onClick={() => add({ parentId: null, afterId: null })} size="sm">
					Top
				</Button>
				<Button onClick={() => add({ parentId: null, beforeId: null })} size="sm">
					Bottom
				</Button>
			</ButtonGroup>

			{/* The last Section is left out: "after" it and "bottom" are the same
			    place, and one of them is the shorter thing to read. */}
			{outline.slice(0, -1).map((node, index) => (
				<button
					key={node.id}
					className="w-full truncate rounded-md border border-edge bg-surface px-2.5 py-1.5 text-left text-12 text-ink hover:border-ink/40 hover:bg-hush"
					onClick={() => add({ parentId: null, afterId: node.id })}
					type="button"
				>
					<span className="text-faint">after {index + 1} · </span>
					{node.title === '' ? 'Untitled section' : node.title}
				</button>
			))}

			<Button
				className="self-end"
				onClick={() => setAsking(false)}
				size="sm"
				variant="quiet"
			>
				cancel
			</Button>
		</div>
	)
}
