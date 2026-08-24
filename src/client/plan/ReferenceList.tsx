import { useEffect, useRef, useState, type ReactNode } from 'react'

import type { Plan, ProposalInput } from '../../shared/plan'
import { Button } from '../components/Button'
import { Chip } from '../components/Chip'
import { CitedLine } from '../components/CitedLine'
import { EmptySlot } from '../components/Field'
import { SourceLink } from '../components/SourceLink'
import { cx } from '../lib/cx'
import { addReference, deleteReference, placeReference, setReference } from './edits'
import type { OutlineEntry } from './outline'
import { sectionLabel } from './outline'
import { ReferenceForm } from './ReferenceForm'
import type { ReferenceEntry } from './references'
import { attribution, referenceEntries, referenceMark, referenceName } from './references'

/**
 * The Plan's References: items Accepted from the Chat or added by hand by the
 * writer. Follows architecture §4.
 *
 * The type is read off the record, never derived from whether a text is
 * present: a Reference may carry a passage without being a Quote.
 */

export interface ReferenceListProps {
	plan: Plan
	entries: OutlineEntry[]
	edit: (ops: ProposalInput | null) => void
	/** Id of a Reference to scroll into view, taking the accent for a moment. */
	accented?: string | null
	/** Said once it has been scrolled to, so the same id can be sent again. */
	onAccented?: () => void
	className?: string
}

export function ReferenceList({
	plan,
	entries,
	edit,
	accented = null,
	onAccented,
	className,
}: ReferenceListProps) {
	// One Reference is open at a time, and `adding` is the blank form.
	const [openId, setOpenId] = useState<string | null>(null)
	const [adding, setAdding] = useState(false)

	return (
		<div className={className}>
			{plan.references.length === 0 && !adding ? (
				<EmptySlot>
					References arrive from the Chat, and land here once you Accept them — or paste
					your own
				</EmptySlot>
			) : null}

			{referenceEntries(plan).map(({ reference, number }) =>
				reference.id === openId ? (
					<ReferenceForm
						key={reference.id}
						onCancel={() => setOpenId(null)}
						onDelete={() => {
							setOpenId(null)
							edit(deleteReference(reference.id))
						}}
						onSave={(content) => {
							setOpenId(null)
							edit(setReference(plan, reference.id, content))
						}}
						reference={reference}
					/>
				) : (
					<ReferenceRow
						key={reference.id}
						entry={{ reference, number }}
						entries={entries}
						accented={reference.id === accented}
						onAccented={onAccented}
						onOpen={() => setOpenId(reference.id)}
						onPlace={(nodeId) => edit(placeReference(plan, reference.id, nodeId))}
					/>
				),
			)}

			{adding ? (
				<ReferenceForm
					onCancel={() => setAdding(false)}
					onSave={(content) => {
						setAdding(false)
						edit(addReference(content))
					}}
				/>
			) : (
				<Button className="self-start" onClick={() => setAdding(true)} size="sm">
					+ reference
				</Button>
			)}
		</div>
	)
}

interface ReferenceRowProps {
	entry: ReferenceEntry
	entries: OutlineEntry[]
	onOpen: () => void
	onPlace: (nodeId: string | null) => void
	accented: boolean
	onAccented?: () => void
}

function ReferenceRow({
	entry,
	entries,
	onOpen,
	onPlace,
	accented,
	onAccented,
}: ReferenceRowProps) {
	const { reference } = entry
	const row = useRef<HTMLDivElement>(null)

	useEffect(() => {
		if (!accented) return

		row.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
		// The accent is a pointer, not a state the row is in, so it lets go by
		// itself rather than waiting to be dismissed.
		const held = setTimeout(() => onAccented?.(), 1600)

		return () => clearTimeout(held)
	}, [accented, onAccented])

	const source = reference.source
	const url = source?.url
	const cited: ReactNode[] = [
		...attribution(source),
		// If we print the title above as a link, we don't need to print it again.
		...(url !== undefined && source?.title === undefined
			? [<SourceLink key="url" url={url} />]
			: []),
	]

	return (
		<div
			ref={row}
			className={cx(
				'flex flex-col gap-1.5 rounded-md border p-2 transition-colors',
				accented ? 'border-accent-edge bg-accent-soft' : 'border-edge bg-surface',
			)}
		>
			<div className="flex items-baseline gap-2">
				<Chip className="font-mono" variant="outline">
					{referenceMark(entry)}
				</Chip>
				{source?.title ? (
					<p className="min-w-0 flex-1 text-12 leading-snug font-medium text-ink">
						{url === undefined ? (
							source.title
						) : (
							<SourceLink url={url}>{source.title}</SourceLink>
						)}
					</p>
				) : (
					<span className="flex-1" />
				)}
				<Button onClick={onOpen} size="sm" variant="quiet">
					edit
				</Button>
			</div>

			{reference.text ? (
				<blockquote className="border-l-2 border-rule pl-2.5 text-13 leading-relaxed text-ink">
					“{reference.text}”
				</blockquote>
			) : null}

			<CitedLine className="break-all" parts={cited} />
			{reference.note ? <p className="text-12 text-muted">{reference.note}</p> : null}

			<select
				aria-label={`Where ${referenceMark(entry)}, ${referenceName(reference)}, sits`}
				className="h-7 rounded-md border border-edge bg-surface px-2 text-12 text-ink"
				onChange={(event) =>
					onPlace(event.target.value === '' ? null : event.target.value)
				}
				value={reference.nodeId ?? ''}
			>
				<option value="">not placed</option>
				{entries.map((entry) => (
					<option key={entry.node.id} value={entry.node.id}>
						{sectionLabel(entry)}{' '}
						{entry.node.title === '' ? 'Untitled' : entry.node.title}
					</option>
				))}
			</select>
		</div>
	)
}
