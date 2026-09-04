import { useCallback, useState } from 'react'

import type { Plan, ProposalInput, Refusal, ScopeTerms } from '../../shared/plan'
import { planAllocation, resolveArticleScope } from '../../shared/plan'
import { GroupHeading } from '../components/Divider'
import { EmptySlot, TextField } from '../components/Field'
import { LengthBar } from '../components/LengthBar'
import { Notice } from '../components/Notice'
import { Panel, type PanelProps } from '../components/Panel'
import { AddSection } from './AddSection'
import type { SectionAnchor } from './edits'
import { addSection, setAdjectives, setTarget, setTitle, setVoice } from './edits'
import { outlineEntries } from './outline'
import { PlanMap } from './PlanMap'
import { ReferenceList } from './ReferenceList'
import { refusalText } from './refusalText'
import { SectionRow } from './SectionRow'
import { ToneFields } from './ToneFields'
import type { OutlineView } from './ViewRail'
import { ViewRail } from './ViewRail'
import { AllocationNote, TargetField } from './WordCount'

/**
 * The Plan Panel — the surface the writer edits directly. It takes the Plan and
 * one `edit` function, so a story can drive it from local state and the app can
 * drive it from the Article Agent, which is the only writer of either.
 */

export interface PlanPanelProps {
	plan: Plan
	/** The House's own Voice and Adjectives — the outermost Scope, which the
	 * Article's Tone and every Section's resolve against (`docs/house.md`).
	 * Empty where the House states nothing, which is what it says before the
	 * writer has been to the House screen. */
	house?: ScopeTerms
	edit: (ops: ProposalInput | null) => void
	/** The rule between this Panel and its neighbour. */
	divider?: PanelProps['divider']
	/** This Panel's share of the Panel row — `panelShare`. */
	grow?: PanelProps['grow']
	/** Why the last edit did not land. */
	refusal?: Refusal | null
	/** What the Article Agent said when a write did not parse. */
	rejected?: string | null
	className?: string
}

export function PlanPanel({
	plan,
	house = {},
	edit,
	divider,
	grow,
	refusal = null,
	rejected = null,
	className,
}: PlanPanelProps) {
	// One Section is open at a time. `made` is the one the writer has just
	// added, which takes the caret as it opens, and `accented` is the Reference a
	// Section row has just sent them down to.
	const [openId, setOpenId] = useState<string | null>(null)
	const [made, setMade] = useState<string | null>(null)
	const [accented, setAccented] = useState<string | null>(null)
	// Not in the Plan: the Article carries no memory of which View was up.
	const [view, setView] = useState<OutlineView>('list')

	/** Shows a View, closing whatever Section the last one had open. */
	const showView = (next: OutlineView) => {
		setView(next)
		setOpenId(null)
		setMade(null)
	}

	// Held: the accented row's effect lists it, and a new function each render
	// would restart that row's scroll on every keystroke elsewhere in the Panel.
	const clearAccent = useCallback(() => setAccented(null), [])

	const entries = outlineEntries(plan.outline)
	const allocation = planAllocation(plan)
	const resolved = resolveArticleScope(plan, house)

	// The bar is the shape of the piece, drawn from the Sections that carry a
	// share of it. A Section with no target is left out rather than taking the
	// bar away: what is placed is still worth seeing.
	const segments = plan.outline
		.filter((node) => node.target !== undefined)
		.map((node) => ({ label: node.title, words: node.target ?? 0 }))

	const add = (anchor: SectionAnchor) => {
		const id = crypto.randomUUID()
		edit(addSection(anchor, id))
		setOpenId(id)
		setMade(id)
	}

	return (
		<Panel className={className} divider={divider} grow={grow} variant="sunk">
			{refusal === null ? null : <Notice>{refusalText(plan, refusal)}</Notice>}
			{rejected === null ? null : (
				<Notice>The Article Agent refused the write. {rejected}</Notice>
			)}

			<TextField
				hiddenLabel="Article title"
				label="Title"
				onChange={(title) => edit(setTitle(plan, null, title))}
				placeholder="Untitled article"
				value={plan.title}
			/>

			<div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
				<TargetField
					className="w-48 shrink-0"
					label="Length"
					onTarget={(target) => edit(setTarget(plan, null, target))}
					target={plan.totalTarget}
				/>
				<AllocationNote allocation={allocation} className="label-meta" />
			</div>

			<ToneFields
				adjectives={plan.adjectives}
				onAdjectives={(adjectives) => edit(setAdjectives(plan, null, adjectives))}
				onVoice={(voice) => edit(setVoice(plan, null, voice))}
				resolved={resolved}
				scopeName="the Article"
				voice={plan.voice ?? null}
			/>

			<GroupHeading
				actions={<ViewRail onView={showView} view={view} />}
				count={plan.outline.length}
			>
				Outline
			</GroupHeading>

			{view === 'map' ? (
				// The map carries its own `+` and draws the References itself.
				<PlanMap edit={edit} plan={plan} />
			) : entries.length === 0 ? (
				<EmptySlot className="min-h-[3.5rem]">
					Sections appear as you agree on them in the Chat — and you can write your own
					straight in here
				</EmptySlot>
			) : (
				<div className="flex items-start gap-3.5">
					<div className="flex min-w-0 flex-1 flex-col gap-1.5">
						{entries.map((entry) => (
							<SectionRow
								key={entry.node.id}
								edit={edit}
								entry={entry}
								house={house}
								onOpen={setOpenId}
								onShowReference={setAccented}
								open={entry.node.id === openId}
								plan={plan}
								takeCaret={entry.node.id === made}
							/>
						))}
					</div>
					{segments.length > 0 ? (
						<LengthBar segments={segments} height={Math.max(120, entries.length * 44)} />
					) : null}
				</div>
			)}

			{view === 'map' ? null : (
				<div className="flex">
					<AddSection onAdd={add} outline={plan.outline} />
				</div>
			)}

			<GroupHeading count={plan.references.length}>References</GroupHeading>
			<ReferenceList
				className="flex flex-col items-stretch gap-1.5"
				edit={edit}
				entries={entries}
				accented={accented}
				onAccented={clearAccent}
				plan={plan}
			/>
		</Panel>
	)
}
