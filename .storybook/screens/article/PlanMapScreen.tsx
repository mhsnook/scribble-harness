import { useState } from 'react'

import { ArticleBar } from '../../../src/client/components/ArticleBar'
import { Chip } from '../../../src/client/components/Chip'
import { Frame, FrameBody } from '../../../src/client/components/Frame'
import { Panel, PanelHeader } from '../../../src/client/components/Panel'
import type { MapBranches } from '../../../src/client/plan/map'
import { PlanMap } from '../../../src/client/plan/PlanMap'
import type { OutlineView } from '../../../src/client/plan/ViewRail'
import { ViewRail } from '../../../src/client/plan/ViewRail'
import type { OutlineNode, Plan, ProposalInput } from '../../../src/shared/plan'
import { applyProposal } from '../../../src/shared/plan'
import { plan } from '../../mock/content'
import { PlanOutline } from './PlanBlocks'

/**
 * 2(k) and 2(l) — the Plan Panel's Map View, in its two shapes.
 *
 * 2(k) is the Plan the interface offers: the Article title, one layer of
 * Sections, and the References placed at each. 2(l) nests Sections inside
 * Sections instead, which the schema allows and no screen offers — it is here
 * as an idea, and `context.md` §Subsection is why it is not the other one.
 */

function nest(id: string, children: OutlineNode[]): (node: OutlineNode) => OutlineNode {
	return (node) => (node.id === id ? { ...node, children } : node)
}

/** The mock Plan with two Sections given Subsections, for the idea screen. A
 * map of a flat list is a comb, and the point of that screen is the branching. */
const recursive: Plan = {
	...plan,
	outline: plan.outline
		.map(
			nest('sec-review', [
				{
					id: 'sec-review-points',
					title: 'The eleven points',
					target: 400,
					children: [],
				},
				{
					id: 'sec-review-clock',
					title: 'One objection resets the clock',
					intent: 'The Hartley case, start to finish.',
					target: 300,
					children: [],
				},
			]),
		)
		.map(
			nest('sec-cost', [
				{
					id: 'sec-cost-record',
					title: 'The ones who would not go on record',
					target: 500,
					children: [],
				},
				{
					id: 'sec-cost-rent',
					title: 'What the delay costs in rent',
					target: 400,
					children: [],
				},
			]),
		),
}

export interface PlanMapScreenProps {
	/** What branches off a Section — `src/client/plan/map.ts`. */
	branches?: MapBranches
}

export function PlanMapScreen({ branches = 'references' }: PlanMapScreenProps) {
	const [view, setView] = useState<OutlineView>('map')
	// The applier behind the map, the way `EditablePlan` puts it behind the
	// Panel: every edit runs the ops the app runs, so a refusal shows up here the
	// way the writer would meet it.
	const [edited, setEdited] = useState<Plan>(branches === 'sections' ? recursive : plan)

	const edit = (ops: ProposalInput | null) => {
		if (ops === null) return

		const result = applyProposal(edited, ops)
		if (result.ok) setEdited(result.plan)
	}

	return (
		<Frame width={860}>
			<ArticleBar title={plan.title} open={['plan']} status="draft 1" />
			{/* Taller than the other Plan screens: the map is wider than a list and
			    an open Section's fields run below the box they open from. */}
			<FrameBody className="h-[32rem]">
				<Panel className="gap-3.5" variant="sunk">
					<PanelHeader
						title="Outline"
						actions={
							<>
								<Chip variant="outline">2,400 words target</Chip>
								<ViewRail onView={setView} view={view} />
							</>
						}
					/>

					{view === 'map' ? (
						<PlanMap branches={branches} edit={edit} plan={edited} />
					) : (
						<PlanOutline className="max-w-md" outline={edited.outline} />
					)}

					<p className="text-11 text-faint">
						{view === 'list'
							? 'The same Outline, listed. Both Views read one Plan, so neither can show a Section the other does not.'
							: branches === 'sections'
								? 'An idea, not a screen: a Section holds Sections, as deep as you take it. + on any box makes one inside it.'
								: 'Click a Section to open its fields, and + on the title to make one. Escape or a click on the space between boxes puts the fields away.'}
					</p>
				</Panel>
			</FrameBody>
		</Frame>
	)
}
