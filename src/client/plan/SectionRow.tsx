import { useEffect, useRef, useState } from 'react'

import type { Plan, ProposalInput } from '../../shared/plan'
import { nodeAllocation, resolveNodeScope } from '../../shared/plan'
import { Button } from '../components/Button'
import { FieldRow, InlineInput, TextField } from '../components/Field'
import { OutlineRow } from '../components/OutlineRow'
import { cx } from '../lib/cx'
import {
	deleteSection,
	moveSection,
	placeReference,
	setAdjectives,
	setIntent,
	setTarget,
	setTitle,
	setVoice,
} from './edits'
import type { OutlineEntry } from './outline'
import { depthName, outlineEntries, sectionLabel } from './outline'
import type { ReferenceEntry } from './references'
import {
	referenceEntries,
	referenceMark,
	referenceName,
	referencesAt,
} from './references'
import { ToneFields } from './ToneFields'
import { AllocationNote, TargetField } from './WordCount'

/**
 * One Section of the Outline, closed until the writer opens it. Closed, it is
 * the row they read: the number, the title, the target, and the Tone. Open, it
 * is every field they edit. One Section is open at a time, so the Panel stays a
 * list rather than a wall of inputs.
 *
 * The row keeps its id through every operation here — a reorder anchors on the
 * neighbour it swaps with, and nothing regenerates an id.
 *
 * **Subsections are TBD.** The Plan carries them and this row renders one, but
 * no control in the app makes, nests, or lifts one — every anchor on offer sits
 * at the top level. The Outline is flat until the flat one is smooth.
 */

export interface SectionRowProps {
	entry: OutlineEntry
	plan: Plan
	edit: (ops: ProposalInput | null) => void
	/** True when this is the Section the writer has open. */
	open: boolean
	/** Open this Section, or close it with null. */
	onOpen: (nodeId: string | null) => void
	/** Take the caret, because the writer just made this Section. */
	takeCaret?: boolean
	/** Scrolls to a placed Reference. Can be absent when the caller draws no
	 * References list; the name then reads as text. */
	onShowReference?: (referenceId: string) => void
	className?: string
}

export function SectionRow({
	entry,
	plan,
	edit,
	open,
	onOpen,
	takeCaret = false,
	onShowReference,
	className,
}: SectionRowProps) {
	const [armed, setArmed] = useState(false)
	const { node, depth, index, ordinal, siblings } = entry

	const name = depthName(depth)
	const scopeName = `${name} ${ordinal}`
	const title = useRef<HTMLInputElement>(null)
	const row = useRef<HTMLDivElement>(null)

	const placedReferences = referencesAt(plan, node.id)
	const unplaceReference = (referenceId: string) =>
		edit(placeReference(plan, referenceId, null))
	const offerableReferences = referenceEntries(plan).filter(
		(entry) => entry.reference.nodeId !== node.id,
	)

	// Opening a Section puts the caret in its title: the closed row's button has
	// just been replaced, so focus would otherwise fall to the page.
	useEffect(() => {
		if (!open) return

		title.current?.focus()
		if (takeCaret) row.current?.scrollIntoView({ block: 'nearest' })
	}, [open, takeCaret])

	/** Enter closes the Section. The write has already gone. */
	const doneOnEnter = (event: { key: string; preventDefault: () => void }) => {
		if (event.key !== 'Enter') return
		event.preventDefault()
		onOpen(null)
	}

	const placedList =
		placedReferences.length === 0 ? null : (
			<div className="flex flex-col gap-0.5">
				{placedReferences.map((held) => (
					<span
						key={held.reference.id}
						className="flex w-full items-baseline gap-1.5 text-11 text-muted"
					>
						<span className="label-meta shrink-0">{referenceMark(held)}</span>
						{onShowReference === undefined ? (
							<span className="min-w-0 flex-1 truncate">
								{referenceName(held.reference)}
							</span>
						) : (
							<button
								className="min-w-0 flex-1 truncate text-left hover:text-ink"
								onClick={() => onShowReference(held.reference.id)}
								type="button"
							>
								{referenceName(held.reference)}
							</button>
						)}
						<button
							aria-label={`Take ${referenceName(held.reference)} off ${scopeName}`}
							className="shrink-0 text-faint hover:text-ink"
							onClick={() => unplaceReference(held.reference.id)}
							type="button"
						>
							×
						</button>
					</span>
				))}
			</div>
		)

	if (!open) {
		return (
			<div
				className={cx('flex flex-col gap-1', className)}
				style={{ marginLeft: depth * 20 }}
			>
				<button
					className="-mx-1.5 rounded-md border border-transparent px-1.5 py-1 text-left hover:border-edge hover:bg-surface"
					onClick={() => onOpen(node.id)}
					// On mousedown: the open Section closes on blur, which relays the
					// list and moves this row before a click would land.
					onMouseDown={(event) => {
						event.preventDefault()
						onOpen(node.id)
					}}
					type="button"
				>
					<OutlineRow node={node} ordinal={ordinal} />
					{node.intent ? (
						<p className="mt-1 truncate pl-[1.375rem] text-12 text-muted">
							{node.intent}
						</p>
					) : null}
				</button>
				{placedList === null ? null : <div className="pl-[1.375rem]">{placedList}</div>}
			</div>
		)
	}

	const resolved = resolveNodeScope(plan, node.id) ?? { voice: null, adjectives: [] }
	const allocation = nodeAllocation(node)

	return (
		<div
			ref={row}
			className={cx(
				'flex items-start gap-2.5 rounded-md border border-edge bg-surface p-2.5',
				className,
			)}
			onBlur={(event) => {
				// Reaching for another field closes this Section. A blur with nowhere
				// to go is not the writer leaving.
				const to = event.relatedTarget
				if (to !== null && !event.currentTarget.contains(to)) onOpen(null)
			}}
			onKeyDown={(event) => {
				if (event.key !== 'Escape') return
				event.stopPropagation()
				onOpen(null)
			}}
			style={{ marginLeft: depth * 20 }}
		>
			<span className="mt-1.5 w-3 shrink-0 font-mono text-11 text-faint">{ordinal}</span>

			<div className="flex min-w-0 flex-1 flex-col gap-2">
				<div className="flex items-center gap-2.5">
					<InlineInput
						ref={title}
						className="min-w-0 flex-1 text-13 leading-snug font-medium"
						label={`Title of ${scopeName}`}
						onChange={(typed) => edit(setTitle(plan, node.id, typed))}
						onKeyDown={doneOnEnter}
						placeholder={`Untitled ${name.toLowerCase()}`}
						value={node.title}
					/>
					<TargetField
						className="w-28 shrink-0"
						hiddenLabel={`Word-count target for ${scopeName}`}
						onKeyDown={doneOnEnter}
						onTarget={(target) => edit(setTarget(plan, node.id, target))}
						placeholder="—"
						target={node.target ?? null}
					/>
				</div>

				{node.children.length > 0 ? (
					<AllocationNote
						allocation={allocation}
						className="text-11 text-faint"
						parts="Subsections"
					/>
				) : null}

				<TextField
					hiddenLabel={`Intent note for ${scopeName}`}
					onChange={(intent) =>
						edit(setIntent(plan, node.id, intent === '' ? null : intent))
					}
					placeholder="What this Section does"
					rows={2}
					value={node.intent ?? ''}
				/>

				{/* Voice, Adjectives, and References are one run of minor fields, so
				    they sit in one column at one rhythm rather than as a block and a
				    stray row beneath it. */}
				<div className="flex flex-col gap-1.5">
					<ToneFields
						adjectives={node.adjectives ?? []}
						onAdjectives={(adjectives) => edit(setAdjectives(plan, node.id, adjectives))}
						onVoice={(voice) => edit(setVoice(plan, node.id, voice))}
						resolved={resolved}
						scopeName={scopeName}
						voice={node.voice ?? null}
					/>

					{/* The label and the picker take one line; what is placed here runs
					    the full width beneath them. */}
					{placedList === null && offerableReferences.length === 0 ? null : (
						<div className="flex flex-col gap-1">
							<FieldRow label="References">
								<SelectReferenceToPlace
									edit={edit}
									nodeId={node.id}
									offerableReferences={offerableReferences}
									plan={plan}
									scopeName={scopeName}
								/>
							</FieldRow>
							{placedList}
						</div>
					)}
				</div>

				<div className="flex flex-wrap items-center gap-1.5 pt-0.5">
					<Button
						aria-label={`Move ${scopeName} up`}
						disabled={index === 0}
						onClick={() => edit(moveSection(plan, node.id, 'up'))}
						size="sm"
						variant="quiet"
					>
						↑
					</Button>
					<Button
						aria-label={`Move ${scopeName} down`}
						disabled={index === siblings.length - 1}
						onClick={() => edit(moveSection(plan, node.id, 'down'))}
						size="sm"
						variant="quiet"
					>
						↓
					</Button>
					<Button
						onBlur={() => setArmed(false)}
						onClick={() => {
							// Two clicks, because there is no undo. Leaving the button disarms
							// it.
							if (armed) edit(deleteSection(node.id))
							else setArmed(true)
						}}
						size="sm"
						variant="quiet"
					>
						{armed ? `delete ${name.toLowerCase()}?` : 'delete'}
					</Button>
					<Button
						className="ml-auto"
						onClick={() => onOpen(null)}
						size="sm"
						variant="quiet"
					>
						done
					</Button>
				</div>
			</div>
		</div>
	)
}

interface SelectReferenceToPlaceProps {
	plan: Plan
	nodeId: string
	offerableReferences: ReferenceEntry[]
	edit: (ops: ProposalInput | null) => void
	/** "Section 2", for the control's name. */
	scopeName: string
}

/** A Reference sits at one Section, so picking one placed elsewhere moves it. */
function SelectReferenceToPlace({
	plan,
	nodeId,
	offerableReferences,
	edit,
	scopeName,
}: SelectReferenceToPlaceProps) {
	if (offerableReferences.length === 0) return null

	const placed = new Map(
		outlineEntries(plan.outline).map((entry) => [entry.node.id, sectionLabel(entry)]),
	)

	return (
		// Styled as `InlineInput` is, to match the Adjective field beside it.
		<select
			aria-label={`Place a Reference at ${scopeName}`}
			className="w-24 appearance-none rounded-sm border-b border-transparent bg-transparent text-11 text-faint outline-none hover:border-edge focus:border-edge"
			onChange={(event) => edit(placeReference(plan, event.target.value, nodeId))}
			value=""
		>
			<option value="">+ reference</option>
			{offerableReferences.map((entry) => (
				<option key={entry.reference.id} value={entry.reference.id}>
					{referenceMark(entry)} {referenceName(entry.reference)}
					{entry.reference.nodeId === null
						? ''
						: ` — now at ${placed.get(entry.reference.nodeId) ?? '—'}`}
				</option>
			))}
		</select>
	)
}
