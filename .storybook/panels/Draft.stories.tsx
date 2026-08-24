import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'

import { ArticleBar } from '../../src/client/components/ArticleBar'
import { Frame, FrameBody } from '../../src/client/components/Frame'
import { ArticleDraftPanel } from '../../src/client/draft/ArticleDraftPanel'
import { ArticleProvider, type DraftStore } from '../../src/client/lib/article'
import type { BlockRow } from '../../src/shared/draft'
import { ARTICLE_TITLE } from '../mock/content'
import { memoryDraftStore, memoryOfferStore } from '../mock/MockArticle'

const meta = {
	title: 'Panels/Draft',
	parameters: { layout: 'centered' },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const para = (id: string, ord: number, text: string): BlockRow => ({
	id,
	ord,
	json: {
		type: 'paragraph',
		attrs: { 'block-id': id },
		content: [{ type: 'text', text }],
	},
})

const SEEDED: BlockRow[] = [
	para('b2', 2, 'Officers put the cost at £2.4m, which has not been published.'),
	para('b1', 1, 'The council voted on Tuesday to extend the scheme.'),
]

/** Only the Draft's half of the Article seam; nothing here reads the Plan. */
function DraftScreen({ store }: { store: DraftStore }) {
	return (
		<ArticleProvider
			value={{
				draft: store,
				offers: memoryOfferStore([]),
				plan: { plan: null, edit: () => null, refusal: null, rejected: null },
			}}
		>
			<Frame width={720}>
				<ArticleBar title={ARTICLE_TITLE} open={['draft']} status="esc" divided={false} />
				<FrameBody className="h-[24rem]" row>
					<ArticleDraftPanel />
				</FrameBody>
			</Frame>
		</ArticleProvider>
	)
}

const surface = (canvas: HTMLElement) =>
	canvas.querySelector<HTMLElement>('.ProseMirror') as HTMLElement

const blockIds = (canvas: HTMLElement) =>
	[...canvas.querySelectorAll('[data-block-id]')].map(
		(el) => (el as HTMLElement).dataset.blockId,
	)

export const Opening: Story = {
	name: 'While the Draft is opening',
	render: () => <DraftScreen store={memoryDraftStore({ stall: true })} />,
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement)

		// Says what it is waiting on, and shows no surface: an empty editor would
		// say the Draft is empty when nobody knows yet.
		await expect(canvas.getByText('Opening the Draft…')).toBeVisible()
		await expect(canvasElement.querySelector('.ProseMirror')).toBeNull()
	},
}

export const Restored: Story = {
	name: 'Reopened where the writer left it',
	render: () => <DraftScreen store={memoryDraftStore({ seed: SEEDED })} />,
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		await waitFor(() => expect(surface(canvasElement)).toBeInTheDocument())

		// Ord order, not the order the rows arrived in.
		await expect(blockIds(canvasElement)).toEqual(['b1', 'b2'])
		await expect(canvas.getByText(/The council voted/)).toBeVisible()
	},
}

export const Writing: Story = {
	name: 'A writer typing',
	render: () => <DraftScreen store={memoryDraftStore()} />,
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		await waitFor(() => expect(surface(canvasElement)).toBeInTheDocument())

		await userEvent.click(surface(canvasElement))
		await userEvent.keyboard('The council voted on Tuesday.')
		await userEvent.keyboard('{Enter}')
		await userEvent.keyboard('Officers put the cost at £2.4m.')

		// Every Block carries its own id, which is what a note anchors to and
		// what the Article Agent stores one row against.
		const ids = blockIds(canvasElement)
		await expect(ids).toHaveLength(2)
		await expect(new Set(ids).size).toBe(2)

		await waitFor(() => expect(canvas.getByText('saved')).toBeVisible(), {
			timeout: 8_000,
		})
	},
}

export const Structure: Story = {
	name: 'The writer places their own structure',
	render: () => <DraftScreen store={memoryDraftStore()} />,
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		await waitFor(() => expect(surface(canvasElement)).toBeInTheDocument())

		await userEvent.click(surface(canvasElement))
		await userEvent.keyboard('What the scheme costs')
		await userEvent.click(canvas.getByRole('button', { name: 'heading' }))

		await expect(canvasElement.querySelector('h2')).toHaveTextContent(
			'What the scheme costs',
		)
		await expect(canvas.getByRole('button', { name: 'heading' })).toHaveAttribute(
			'aria-pressed',
			'true',
		)

		// A section break is a Block of its own, so it takes an id like any other.
		await userEvent.click(canvas.getByRole('button', { name: 'section break' }))
		await expect(canvasElement.querySelector('hr')).toHaveAttribute('data-block-id')
	},
}

export const NotSaved: Story = {
	name: 'A save that did not land',
	render: () => (
		<DraftScreen store={memoryDraftStore({ reject: 'The Article Agent refused it.' })} />
	),
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		await waitFor(() => expect(surface(canvasElement)).toBeInTheDocument())

		await userEvent.click(surface(canvasElement))
		await userEvent.keyboard('Something worth keeping.')

		await waitFor(() => expect(canvas.getByText(/did not save/)).toBeVisible(), {
			timeout: 8_000,
		})

		// A failed write says so and destroys nothing: the prose is still there
		// to copy, and the next save carries it again.
		await expect(canvas.getByText(/Something worth keeping/)).toBeVisible()
		await expect(canvas.getByText('not saved')).toBeVisible()
	},
}

export const UndoKeepsIds: Story = {
	name: 'Undo gives a Block its id back',
	render: () => <DraftScreen store={memoryDraftStore({ seed: SEEDED })} />,
	play: async ({ canvasElement }) => {
		await waitFor(() => expect(surface(canvasElement)).toBeInTheDocument())
		const before = blockIds(canvasElement)

		await userEvent.click(surface(canvasElement))
		await userEvent.keyboard('{Control>}a{/Control}{Backspace}')
		await userEvent.keyboard('{Control>}z{/Control}')

		// Every note anchor in phase 2 rides on this holding.
		await waitFor(() => expect(blockIds(canvasElement)).toEqual(before))
	},
}

export const ClickAnywhere: Story = {
	name: 'Clicking anywhere on an empty Draft',
	render: () => <DraftScreen store={memoryDraftStore()} />,
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		await waitFor(() => expect(surface(canvasElement)).toBeInTheDocument())
		const editable = surface(canvasElement)

		// A drafting surface takes the caret wherever the writer clicks in it, so
		// the whole Panel below the toolbar has to be the editable — the gutter
		// beside the first line and the empty space far under it included.
		const box = editable.getBoundingClientRect()
		const corners = [
			[box.left + 4, box.top + 4],
			[box.right - 4, box.top + 4],
			[box.left + 4, box.bottom - 4],
			[box.right - 4, box.bottom - 4],
		] as const

		for (const [x, y] of corners) {
			await expect(editable.contains(document.elementFromPoint(x, y))).toBe(true)
		}

		// And the editable reaches the foot of the Panel it sits in.
		const panel = canvasElement.querySelector('[data-panel]') as HTMLElement
		await expect(box.bottom).toBeCloseTo(panel.getBoundingClientRect().bottom, 0)

		// Clicking that far-down space writes into the Draft.
		await userEvent.pointer({
			target: editable,
			coords: { clientX: box.left + 8, clientY: box.bottom - 8 },
			keys: '[MouseLeft]',
		})
		await userEvent.keyboard('Clicked low, typed anyway.')
		await expect(canvas.getByText('Clicked low, typed anyway.')).toBeVisible()
	},
}
