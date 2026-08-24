import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'

import { Annotation } from '../../../src/client/components/Annotation'
import { Frame, FrameBody } from '../../../src/client/components/Frame'
import { PlanPanel } from '../../../src/client/plan/PlanPanel'
import type { Plan, ProposalInput, Refusal } from '../../../src/shared/plan'
import { applyProposal, emptyPlan } from '../../../src/shared/plan'
import { plan as plannedArticle } from '../../mock/content'
import { MockArticle } from '../../mock/MockArticle'
import { BlankPlanScreen } from './BlankPlanScreen'
import { ChatWithReferencesScreen } from './ChatWithReferencesScreen'
import { LedgerDrawerScreen } from './LedgerDrawerScreen'
import { LedgerPopoverScreen } from './LedgerPopoverScreen'
import { MarkdownTurnScreen } from './MarkdownTurnScreen'
import { MidChatScreen } from './MidChatScreen'
import { PlanMapScreen } from './PlanMapScreen'
import { PlanSheetScreen } from './PlanSheetScreen'
import { ReadyToDraftScreen } from './ReadyToDraftScreen'
import { StaleProposalScreen } from './StaleProposalScreen'

const meta = {
	title: 'Screens/2 Plan an article',
	parameters: { layout: 'centered' },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

/**
 * The Plan Panel, with the applier behind it and local state standing in for
 * the Article Agent. Every edit runs the ops the app runs, so a refusal shows
 * up here the way the writer would meet it.
 */
function EditablePlan({ start }: { start: Plan }) {
	const [plan, setPlan] = useState(start)
	const [refusal, setRefusal] = useState<Refusal | null>(null)

	const edit = (ops: ProposalInput | null) => {
		if (ops === null) return

		setRefusal(null)
		const result = applyProposal(plan, ops)
		if (result.ok) setPlan(result.plan)
		else setRefusal(result.refusal)
	}

	return (
		<Frame width={520}>
			<FrameBody className="h-[26rem]">
				<PlanPanel edit={edit} plan={plan} refusal={refusal} />
			</FrameBody>
		</Frame>
	)
}

export const A_BlankPlan: Story = {
	name: '2(a) Blank page',
	render: () => (
		<div className="flex flex-col">
			<BlankPlanScreen />
			<Annotation>
				Nothing on this screen is accented, and that is the point: an empty plan is not
				asking you for a decision yet. The plan is live from the first message so it can
				never feel like a gate you have to pass.
			</Annotation>
		</div>
	),
}

export const B_MidConversation: Story = {
	name: '2(b) Mid-chat',
	render: () => (
		<div className="flex flex-col">
			<MockArticle>
				<MidChatScreen />
			</MockArticle>
			<Annotation>
				Wired, and the Proposal is live: Accept it and the Section lands in the Outline
				beside it and the total moves to 2,800. The Chat proposes and the client applies,
				so the ops run through the same writer the Plan Panel types into.
			</Annotation>
		</div>
	),
}

const paragraph =
	'The appeal is the part nobody files, and that is the whole mechanism: the objector pays nothing, the clock resets, and the scheme sits another eleven weeks. I want that in its own section rather than folded into the cost one.'

export const B2_ComposerGrows: Story = {
	name: '2(b·i) A paragraph in the composer',
	render: () => (
		<div className="flex flex-col">
			<MockArticle>
				<MidChatScreen />
			</MockArticle>
			<Annotation>
				The composer grows with what the writer types or pastes, up to eight lines. Past
				that it scrolls inside itself, so the transcript above it never falls below about
				half the Panel — this screen is the one the ceiling was picked against. Enter
				breaks the line; control-Enter sends.
			</Annotation>
		</div>
	),
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		const field = canvas.getByLabelText('Message the guide') as HTMLTextAreaElement
		const panel = canvasElement.querySelector('[data-panel]')!
		const composer = canvasElement.querySelector('[data-composer]')!
		// The foot of the transcript, which is where the Chat sits: the opening
		// line has scrolled off the top by now, and the Proposal is the thing the
		// writer is being asked about.
		const latest = canvas.getByText(/The appeal that nobody files/)

		const empty = field.clientHeight

		// This screen is parked on a Proposal and cannot send, so the keys are
		// `Primitives/Overview`'s to check.
		await userEvent.click(field)
		await userEvent.paste(paragraph)
		await expect(field.clientHeight).toBeGreaterThan(empty)

		// Two more paragraphs are past any ceiling, so a fourth changing nothing is
		// the ceiling holding rather than the text happening to fit.
		await userEvent.paste(paragraph.repeat(2))
		const ceiling = field.clientHeight
		await userEvent.paste(paragraph)
		await expect(field.clientHeight).toBe(ceiling)
		await expect(field.scrollHeight).toBeGreaterThan(ceiling)

		// Measured on the field, not the whole composer: the parked Proposal's
		// Notice sits above it, and that is a state the writer is asked to leave.
		const panelBox = panel.getBoundingClientRect()
		const composerBox = composer.getBoundingClientRect()
		await expect(field.clientHeight).toBeLessThanOrEqual(panelBox.height / 2)

		const latestBox = latest.getBoundingClientRect()
		await expect(latestBox.top).toBeGreaterThanOrEqual(panelBox.top)
		await expect(latestBox.bottom).toBeLessThanOrEqual(composerBox.top)

		// Pinned to the foot, so there is nothing below and nothing offering to
		// take you there.
		const transcript = canvasElement.querySelector('[data-scroller]')!
		await expect(canvas.queryByLabelText('Scroll to the latest')).toBeNull()

		// Scrolled up, the way back appears.
		transcript.scrollTop = 0
		const back = await canvas.findByLabelText('Scroll to the latest')

		await userEvent.click(back)
		await waitFor(() =>
			expect(
				transcript.scrollHeight - transcript.scrollTop - transcript.clientHeight,
			).toBeLessThanOrEqual(24),
		)
		await waitFor(() =>
			expect(canvas.queryByLabelText('Scroll to the latest')).toBeNull(),
		)
	},
}

export const B3_MarkdownTurn: Story = {
	name: '2(b·ii) A turn in markdown',
	render: () => (
		<div className="flex flex-col">
			<MockArticle>
				<MarkdownTurnScreen />
			</MockArticle>
			<Annotation>
				The guide writes markdown, so a guide turn renders it: headings, lists, a table
				that scrolls inside the turn, and a link that opens away from the harness. Your
				own message is left exactly as you typed it — the asterisks in the first line are
				yours, and a message that restyles itself on send is one you have to read twice.
				Mid-stream the marks are closed as they arrive, so a half-typed{' '}
				<code>**bold</code> never flashes its asterisks.
			</Annotation>
		</div>
	),
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement)

		// The guide's markdown is elements, not the characters that made them.
		await expect(
			canvas.getByRole('heading', { name: 'What the releases turned up' }),
		).toBeVisible()
		await expect(canvas.getByText('Florida grasshopper sparrow').tagName).toBe('STRONG')
		await expect(canvas.getByRole('table')).toBeVisible()
		await expect(canvasElement.querySelectorAll('li').length).toBeGreaterThan(4)
		await expect(canvas.queryByText(/\*\*Florida grasshopper sparrow\*\*/)).toBeNull()

		// A citation opens in its own tab, so the draft behind it stays put.
		const cited = canvas.getByRole('link', { name: 'Journal of Threatened Taxa' })
		await expect(cited).toHaveAttribute('target', '_blank')
		await expect(cited).toHaveAttribute('rel', expect.stringContaining('noreferrer'))

		// The writer's own asterisks are still asterisks.
		await expect(canvas.getByText(/\*\*captive-bred releases\*\*/)).toBeVisible()

		// The table is wider than the Panel and scrolls inside the turn rather
		// than stretching the transcript under it.
		const table = canvas.getByRole('table')
		const scroller = canvasElement.querySelector('[data-scroller]')!
		await expect(table.getBoundingClientRect().right).toBeLessThanOrEqual(
			scroller.getBoundingClientRect().right + 1,
		)
		await expect(scroller.scrollWidth).toBe(scroller.clientWidth)
	},
}

export const C_ReadyToDraft: Story = {
	name: '2(c) Ready to draft',
	render: () => (
		<div className="flex flex-col">
			<ReadyToDraftScreen />
			<Annotation>
				The button is a nudge, not a gate — it appears once the plan has a length and at
				least one section, and the draft pill was clickable long before it showed up.
			</Annotation>
		</div>
	),
}

export const D_ChatWithReferences: Story = {
	name: '2(d) A turn that returned a lot',
	render: () => (
		<div className="flex flex-col">
			<MockArticle>
				<ChatWithReferencesScreen />
			</MockArticle>
			<Annotation>
				Accept and Decline are the writer's two rulings, and they are the words everywhere
				— the card, the Offer ledger, and the Plan. Accepting copies the Offer into the
				Plan and leaves the row where it is.
			</Annotation>
		</div>
	),
}

export const E_PlanSheet: Story = {
	name: '2(e) The plan on its own',
	render: () => (
		<div className="flex flex-col">
			<PlanSheetScreen />
			<Annotation>
				The Outline and the References are stacked, never columned: inside a status the
				eye should only have to travel one way. One list holds both Links and Quotes,
				because the type is a field on the record. The bar beside the Outline is the shape
				of the piece — 300 / 700 / 900 / 500 of 2,400.
			</Annotation>
		</div>
	),
}

export const F_LedgerDrawer: Story = {
	name: '2(f) Offer ledger',
	render: () => (
		<div className="flex flex-col">
			<MockArticle>
				<LedgerDrawerScreen />
			</MockArticle>
			<Annotation>
				A drawer over the transcript, not a screen the Chat swaps to: the composer stays
				uncovered, so the control that opened it closes it, and Escape does too. The same
				list at every stage — early on most rows read Undecided, later most are placed,
				which is why there is no separate triage screen. Accepting a row copies it into
				the Plan on the right: the row keeps what was turned up, and the copy is the
				writer's to edit.
			</Annotation>
		</div>
	),
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		const toggle = canvas.getByRole('button', { name: /Offer ledger/ })
		const drawer = canvasElement.querySelector('[aria-label="Offer ledger"]')!
		const transcript = canvasElement.querySelector('[data-scroller]')!
		const composer = canvasElement.querySelector('[data-composer]')!
		// Measured against the transcript's foot, not the composer's own box: the
		// composer sits inside a padded wrapper, and the drawer stops at the
		// wrapper's edge rather than at the field.
		const foot = () => transcript.getBoundingClientRect().bottom

		// The drawer covers the transcript and leaves the composer alone, which is
		// what keeps the toggle in place for the second click.
		await expect(toggle.getAttribute('aria-expanded')).toBe('true')
		await expect(drawer.getBoundingClientRect().top).toBeLessThan(foot())
		await expect(drawer.getBoundingClientRect().bottom).toBeLessThanOrEqual(
			composer.getBoundingClientRect().top,
		)

		// One control, both directions. The geometry waits on the 200ms slide.
		await userEvent.click(toggle)
		await expect(toggle.getAttribute('aria-expanded')).toBe('false')
		await waitFor(() =>
			expect(drawer.getBoundingClientRect().top).toBeGreaterThanOrEqual(foot() - 1),
		)

		// Opening moves the drawer and nothing else. Focus lands on it while it is
		// still out of view, and a browser reveals such an element by scrolling the
		// box clipping it, which would carry the transcript with it.
		const still = transcript.getBoundingClientRect().top
		await userEvent.click(toggle)
		await expect(toggle.getAttribute('aria-expanded')).toBe('true')
		await expect(transcript.getBoundingClientRect().top).toBe(still)
		await expect(drawer.parentElement!.scrollTop).toBe(0)

		// Escape dismisses, and focus lands back on the toggle rather than in the
		// transcript behind it.
		await userEvent.keyboard('{Escape}')
		await expect(toggle.getAttribute('aria-expanded')).toBe('false')
		await expect(document.activeElement).toBe(toggle)
		await expect(transcript.getBoundingClientRect().top).toBe(still)
	},
}

export const G_LedgerPopover: Story = {
	name: '2(g) Offer ledger from the composer',
	render: () => (
		<div className="flex flex-col">
			<MockArticle>
				<LedgerPopoverScreen />
			</MockArticle>
			<Annotation>
				The groups are the three rulings and their order is fixed, so the Undecided pile
				visibly shrinks as you work. It reads no Plan: once an Offer is Accepted, where
				the Reference sits is the Plan Panel's to show.
			</Annotation>
		</div>
	),
}

export const H_PlanPanelBlank: Story = {
	name: '2(h) The Plan Panel, new Article',
	render: () => (
		<div className="flex flex-col">
			<EditablePlan start={emptyPlan()} />
			<Annotation>
				The wired Panel, not a wireframe. A new Article opens into this: a title, no
				length, no Tone, and one button that makes the first Section.
			</Annotation>
		</div>
	),
}

export const I_PlanPanelWired: Story = {
	name: '2(i) The Plan Panel, under way',
	render: () => (
		<div className="flex flex-col">
			<EditablePlan start={plannedArticle} />
			<Annotation>
				Every field here writes through the same ops the Chat proposes in, so the Panel
				cannot make a change the applier would refuse. Typing debounces: the Plan is one
				blob re-broadcast on every write, and a keystroke is not a write. The rail on the
				Outline heading swaps the list for the map, which is wider than this Panel and
				scrolls sideways inside it.
			</Annotation>
		</div>
	),
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement)

		await userEvent.click(canvas.getByRole('button', { name: 'map' }))

		// Measured on the box that scrolls, not on the SVG inside it: the SVG
		// carries its own height attribute and keeps it either way. The map is
		// taller than this Panel and `overflow-x-auto` resolves that box's
		// `min-height` to 0, so a flex column that overflows squeezes it to
		// nothing unless it refuses to shrink.
		const map = canvasElement.querySelector('[data-plan-map]')!
		await expect(map.getBoundingClientRect().height).toBeGreaterThan(100)

		// The Panel's own two Outline controls stand down while the map is up,
		// because the map carries a `+` of its own.
		await expect(canvas.queryByRole('button', { name: '+ section' })).toBeNull()

		await userEvent.click(canvas.getByRole('button', { name: 'list' }))
		await expect(canvas.getByRole('button', { name: '+ section' })).toBeVisible()
	},
}

export const J_StaleProposal: Story = {
	name: '2(j) A Proposal the Plan refuses',
	render: () => (
		<div className="flex flex-col">
			<MockArticle>
				<StaleProposalScreen />
			</MockArticle>
			<Annotation>
				Accept it. Whole-field comparison is conservative and will refuse a Proposal
				against a field the writer has since touched, so the card says which op failed,
				what it expected, and what it found — never a greyed-out card with no explanation.
				It stays open: fix the Plan and Accept again, or Decline and the Chat is told why.
			</Annotation>
		</div>
	),
}

export const K_PlanMap: Story = {
	name: '2(k) The Plan as a map',
	render: () => (
		<div className="flex flex-col">
			<PlanMapScreen />
			<Annotation>
				A second View of the same Plan, opened left to right: the Article title, its
				Sections, and the References placed at each. Three columns, which is the whole
				Plan — an unplaced Reference is in the list below and not on the map. Clicking a
				Section opens its fields over it, anchored at the box, so nothing reflows around
				what you are editing. Escape or a click on the space between boxes puts them away.{' '}
				<code>+</code> on the title makes a Section, and one made with nothing in it is
				thrown away again when you leave it.
			</Annotation>
		</div>
	),
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement)

		// Both Views read one Plan, so a Section the map draws is one the list
		// has too. The rail is how the writer gets between them.
		await userEvent.click(canvas.getByRole('button', { name: 'list' }))
		await expect(canvas.queryByLabelText(/^Map of /)).toBeNull()
		await expect(canvas.getByText('Who actually pays for the delay')).toBeVisible()

		await userEvent.click(canvas.getByRole('button', { name: 'map' }))
		await expect(
			canvas.getByLabelText('Map of Why Cities Stopped Building'),
		).toBeVisible()

		// A Reference placed at a Section is a box hanging off it, keeping the
		// number it has in the Plan's list.
		const cost = canvas
			.getByRole('button', { name: 'Who actually pays for the delay', exact: true })
			.closest('foreignObject')!
		await expect(within(cost as unknown as HTMLElement).getByText('–')).toBeVisible()
		await expect(canvas.getByText('Zoning and the missing middle')).toBeVisible()

		// Folding is a read affordance, so the Section stays and only what sits
		// inside it goes.
		await userEvent.click(
			canvas.getByLabelText('Fold the 1 inside Who actually pays for the delay'),
		)
		await expect(canvas.queryByText('Zoning and the missing middle')).toBeNull()
		await expect(canvas.getByText('Who actually pays for the delay')).toBeVisible()
		await userEvent.click(
			canvas.getByLabelText('Open the 1 inside Who actually pays for the delay'),
		)

		// Clicking a box opens the Section's own fields over the map, anchored at
		// the box. The map keeps its shape underneath: nothing reflows around it.
		const before = canvas
			.getByLabelText('Map of Why Cities Stopped Building')
			.getBoundingClientRect()

		await userEvent.click(
			canvas.getByRole('button', { name: 'The year the cranes stopped', exact: true }),
		)
		const title = canvas.getByLabelText('Title of Section 1') as HTMLInputElement
		await expect(title).toHaveValue('The year the cranes stopped')
		await expect(
			canvas.getByLabelText('Map of Why Cities Stopped Building').getBoundingClientRect(),
		).toEqual(before)

		// Escape puts the fields away, which is what `SectionRow` already does for
		// the Panel.
		await userEvent.keyboard('{Escape}')
		await expect(canvas.queryByLabelText('Title of Section 1')).toBeNull()

		// So does the space between the boxes, which is the one place on the map
		// that does nothing else on a click.
		await userEvent.click(
			canvas.getByRole('button', { name: 'The year the cranes stopped', exact: true }),
		)
		// In the document rather than visible: the fields fade in from nothing, so
		// an assertion this close to the click can land inside the transition.
		await expect(canvas.getByLabelText('Title of Section 1')).toBeInTheDocument()
		await userEvent.click(canvas.getByLabelText('Map of Why Cities Stopped Building'))
		await expect(canvas.queryByLabelText('Title of Section 1')).toBeNull()

		// `+` on the title makes a Section, last in the Outline, open with the
		// caret in it. A Section takes none: References branch off it here.
		await expect(
			canvas.queryByLabelText('Add a Section inside The year the cranes stopped'),
		).toBeNull()

		await userEvent.click(canvas.getByLabelText('Add a Section to the Outline'))
		const made = canvas.getByLabelText('Title of Section 5') as HTMLInputElement
		await expect(made).toHaveValue('')
		await expect(made).toHaveFocus()

		// Left with nothing in it, it goes again rather than leaving an untitled
		// box on the map.
		await userEvent.keyboard('{Escape}')
		await expect(canvas.queryByLabelText('Title of Section 5')).toBeNull()
		await expect(canvas.queryByText('Untitled section')).toBeNull()

		// Given a title, it stays.
		await userEvent.click(canvas.getByLabelText('Add a Section to the Outline'))
		await userEvent.type(
			canvas.getByLabelText('Title of Section 5'),
			'What a faster desk does',
		)
		await userEvent.keyboard('{Escape}')
		await expect(canvas.getByText('What a faster desk does')).toBeVisible()

		// Placing a Reference is in the open Section's fields, not on the box.
		await userEvent.click(
			canvas.getByRole('button', { name: 'What a faster desk does', exact: true }),
		)
		await userEvent.selectOptions(
			canvas.getByLabelText('Place a Reference at Section 5'),
			canvas.getByRole('option', { name: /Zoning and the missing middle/ }),
		)
		await userEvent.keyboard('{Escape}')

		// It moved rather than being copied: one Reference sits at one Section, so
		// the new Section now has one box hanging off it, and the Section it came
		// from has none.
		await expect(
			canvas.getByLabelText('Fold the 1 inside What a faster desk does'),
		).toBeVisible()
		await expect(
			canvas.queryByLabelText('Fold the 1 inside Who actually pays for the delay'),
		).toBeNull()
		await expect(canvas.getByText('Zoning and the missing middle')).toBeVisible()
	},
}

export const L_PlanMapRecursive: Story = {
	name: '2(l) Outline with recursion (idea)',
	render: () => (
		<div className="flex flex-col">
			<PlanMapScreen branches="sections" />
			<Annotation>
				An idea, not a screen. Here a Section branches into the Sections inside it rather
				than into its References, as deep as the writer takes it, and <code>+</code> on
				any box makes one more. The Plan's schema already holds this — `OutlineNode` is
				recursive — and the interface offers two levels, because anything deeper wants a
				word writers already hold, like Chapter, rather than a more recursive one. 2(k) is
				what we are building. Each Section says which References sit at it, since nothing
				here draws them.
			</Annotation>
		</div>
	),
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement)

		// The whole point of the idea: a Section takes a Section inside it, and
		// the one it makes takes another.
		await userEvent.click(
			canvas.getByLabelText('Add a Section inside What a faster city would look like'),
		)
		const made = canvas.getByLabelText('Title of Subsection 4.1') as HTMLInputElement
		await userEvent.type(made, 'The permit desk that answers')
		await userEvent.keyboard('{Escape}')

		await expect(
			canvas.getByLabelText('Add a Section inside The permit desk that answers'),
		).toBeVisible()

		// Nothing draws a Reference here, so a Section says which sit at it.
		await expect(canvas.getByText('refs [1] [3]')).toBeVisible()
	},
}
