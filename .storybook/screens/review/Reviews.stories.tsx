import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'

import { Annotation } from '../../../src/client/components/Annotation'
import { FullReviewScreen } from './FullReviewScreen'
import { NotesToChatScreen } from './NotesToChatScreen'
import { PanelCombosScreen } from './PanelCombosScreen'
import { PanelsRecapScreen } from './PanelsRecapScreen'
import { PhoneNotesScreen } from './PhoneNotesScreen'
import { ReviewRailScreen } from './ReviewRailScreen'
import { RunReviewScreen } from './RunReviewScreen'

const meta = {
	title: 'Screens/4 Reviews',
	parameters: { layout: 'centered' },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const A_FullReview: Story = {
	name: '4(a) One Review, read whole',
	render: () => (
		<div className="flex flex-col">
			<FullReviewScreen />
			<Annotation>
				Only this pass takes the window — you asked for it. The prose is the review and
				the Notes are what survive it, which is why a Note can be one line: you have just
				read the argument above it.
			</Annotation>
		</div>
	),
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement)

		// The reasoning and the Notes it produced sit together, in order.
		await expect(
			canvas.getByText(/Two supporting points do most of the work/),
		).toBeVisible()
		await expect(canvas.getByText(/Cut to a clause/)).toBeVisible()

		// A tranche counts itself rather than the model stating a number.
		await expect(canvas.getByText(/on the first point/)).toHaveTextContent('3')

		// Ruling one Note here is the same write the Notes Panel makes.
		const note = canvas.getByText(/Strongest version/).closest('article') as HTMLElement
		await userEvent.click(within(note).getByRole('button', { name: 'accept' }))

		await waitFor(() =>
			expect(within(note).getByRole('button', { name: 'resolve' })).toBeVisible(),
		)
	},
}

export const B_ReviewRail: Story = {
	name: '4(b) The Notes beside the Draft',
	render: () => (
		<div className="flex flex-col">
			<ReviewRailScreen />
			<Annotation>
				The Panel stays on the Round it ran, the way the Chat stays on its last turn. `all
				notes` opens the whole record over it, because a Note accepted three Rounds ago is
				still owed.
			</Annotation>
		</div>
	),
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement)

		// The Panel opens on a Round, the way the Chat opens on the transcript.
		await waitFor(() => expect(canvas.getByText(/you asked/)).toBeVisible())

		// An anchor is read as a position, and the record holds an id.
		await expect(canvas.getAllByText(/¶2/).length).toBeGreaterThan(0)

		// The whole record is a drawer away. Every assertion below reads inside it,
		// because the Round it opens over is still drawing its own Notes.
		await userEvent.click(canvas.getByRole('button', { name: /All Notes/ }))

		const ledger = within(canvas.getByRole('group', { name: 'All Notes' }))
		await waitFor(() => expect(ledger.getByText('All Notes')).toBeVisible())

		// A Note the writer declined is counted rather than listed, because they
		// have already said no to it.
		await expect(ledger.queryByText(/Always the plan/)).toBeNull()
		await userEvent.click(ledger.getByRole('button', { name: /1 declined/ }))
		await waitFor(() => expect(ledger.getByText(/Always the plan/)).toBeVisible())

		// A settled Note is a line until it is asked for, and then it is a card
		// with its way back.
		await expect(ledger.queryByRole('button', { name: 'undo' })).toBeNull()
		await userEvent.click(ledger.getByText(/£4,100 figure/))
		await waitFor(() =>
			expect(ledger.getByRole('button', { name: 'undo' })).toBeVisible(),
		)
	},
}

export const G_RunReview: Story = {
	name: '4(g) Asking for a Review',
	render: () => (
		<div className="flex flex-col">
			<RunReviewScreen />
			<Annotation>
				The Article Agent runs the Review, so the wait is a row rather than a call you are
				holding open. Close the tab and the findings are here when you come back.
			</Annotation>
		</div>
	),
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement)

		await waitFor(() => expect(canvas.getByText(/No Reviews yet/)).toBeVisible())

		await userEvent.type(
			canvas.getByRole('textbox', { name: /What this Review should look for/ }),
			'Review for repetition of the supporting logic.',
		)
		await userEvent.click(canvas.getByRole('button', { name: 'run review' }))

		// Asking moves the Panel onto the Round it just started, rather than
		// leaving the writer reading the one before it. The wait says what is
		// happening and that leaving is safe.
		await waitFor(() => expect(canvas.getByText(/Reading the Draft/)).toBeVisible())
		await expect(canvas.getByText(/you asked/)).toBeVisible()

		// And the Notes arrive without the writer asking again. Read inside the
		// Round rather than across the Panel: the ledger stays mounted when it is
		// closed, so every Note is in the DOM twice.
		const round = within(
			canvasElement.querySelector('[data-panel] [data-scroller]') as HTMLElement,
		)

		await waitFor(() => expect(round.getByText(/Strongest version/)).toBeVisible(), {
			timeout: 5_000,
		})
	},
}

export const C_NotesToChat: Story = {
	name: '4(c) Notes sent to chat',
	render: () => (
		<div className="flex flex-col">
			<NotesToChatScreen />
			<Annotation>
				Not built, and kept as a sketch. The loop it draws: draft → review → accept notes
				→ notes go to chat → the plan changes → draft again.
			</Annotation>
		</div>
	),
}

export const D_Phone: Story = {
	name: '4(d) On the phone',
	render: () => (
		<div className="flex flex-col">
			<PhoneNotesScreen />
			<Annotation>
				A form factor, not a status. Read and triage; no writing happens here.
			</Annotation>
		</div>
	),
}

export const E_PanelCombos: Story = {
	name: '4(e) Recap · Panel combinations',
	render: () => <PanelCombosScreen />,
}

export const F_PanelsRecap: Story = {
	name: '4(f) Recap · the four Panels',
	render: () => <PanelsRecapScreen />,
}
