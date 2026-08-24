import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, within } from 'storybook/test'

import { Button } from '../src/client/components/Button'
import { ChatComposer, ChatMessage } from '../src/client/components/Chat'
import { Check } from '../src/client/components/Check'
import { Chip } from '../src/client/components/Chip'
import { Divider } from '../src/client/components/Divider'
import { ExampleBlock, PolarityHeading } from '../src/client/components/ExampleBlock'
import { EmptySlot, Field } from '../src/client/components/Field'
import { GuidanceNote, NoteDot } from '../src/client/components/GuidanceNote'
import { LengthBar } from '../src/client/components/LengthBar'
import { OutlineRow } from '../src/client/components/OutlineRow'
import { PanelRail, type PanelId } from '../src/client/components/PanelRail'
import { ProgressBar } from '../src/client/components/ProgressBar'
import { QuoteRow } from '../src/client/components/QuoteRow'
import { ReferenceCard } from '../src/client/components/ReferenceCard'
import { offers, plan, sectionState } from './mock/content'

const meta = {
	title: 'Primitives/Overview',
	parameters: { layout: 'padded' },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function Row({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div className="flex flex-col gap-2 border-b border-rule py-4 last:border-b-0">
			<p className="label-meta">{label}</p>
			<div className="flex flex-wrap items-center gap-3">{children}</div>
		</div>
	)
}

export const Buttons: Story = {
	render: () => (
		<div className="w-[40rem]">
			<Row label="Button variants">
				<Button variant="accent">start drafting →</Button>
				<Button>download</Button>
				<Button variant="quiet">declined</Button>
				<Button variant="link">see all drafts</Button>
			</Row>
			<Row label="Chips">
				<Chip variant="accent">review ready</Chip>
				<Chip>700w</Chip>
				<Chip variant="outline">well researched</Chip>
				<Chip variant="muted">—</Chip>
				<Chip dimmed>declined</Chip>
			</Row>
			<Row label="Check — accepting is the decision these lists ask for">
				<Check />
				<Check checked />
			</Row>
			<Row label="Fields">
				<Field label="Length" value="2,400 words" className="w-64" />
				<Field label="Length" placeholder="words —" className="w-64" />
			</Row>
			<Row label="Empty slot — dashed always means optional and unfilled">
				<EmptySlot className="w-72">Tick a reference in the chat</EmptySlot>
			</Row>
		</div>
	),
}

export const PanelToggle: Story = {
	render: function PanelToggleStory() {
		const [open, setOpen] = useState<PanelId[]>(['plan', 'draft'])
		return (
			<div className="flex w-[40rem] flex-col gap-4">
				<PanelRail
					open={open}
					onToggle={(Panel) =>
						setOpen((current) =>
							current.includes(Panel)
								? current.filter((p) => p !== Panel)
								: [...current, Panel],
						)
					}
				/>
				<p className="text-13 text-muted">
					Open:{' '}
					{open.length ? open.join(' · ') : 'nothing — the app would keep the draft up'}
				</p>
			</div>
		)
	},
}

export const Composer: Story = {
	render: function ComposerStory() {
		const [sent, setSent] = useState<string[]>([])

		return (
			<div className="flex w-[26rem] flex-col gap-4">
				<Row label="Chat composer — Enter breaks the line, control-Enter sends">
					<ChatComposer
						onSend={(text) => setSent((held) => [...held, text])}
						className="w-full"
					/>
				</Row>
				<ul aria-label="Sent" className="flex flex-col gap-1">
					{sent.map((text, index) => (
						<li
							key={index}
							className="rounded-md bg-hush px-3 py-2 text-13 leading-relaxed whitespace-pre-wrap text-ink"
						>
							{text}
						</li>
					))}
				</ul>
			</div>
		)
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		const field = canvas.getByLabelText('Message the guide') as HTMLTextAreaElement

		const sent = within(canvas.getByLabelText('Sent'))

		await userEvent.click(field)
		await userEvent.keyboard('one{Enter}two')
		await expect(field.value).toBe('one\ntwo')
		await expect(sent.queryAllByRole('listitem')).toHaveLength(0)

		await userEvent.keyboard('{Control>}{Enter}{/Control}')
		await expect(field.value).toBe('')
		await expect(sent.getAllByRole('listitem')[0]).toHaveTextContent('one two')

		// `{Meta>}` is command, which sends on a Mac.
		await userEvent.keyboard('again{Meta>}{Enter}{/Meta}')
		await expect(field.value).toBe('')
		await expect(sent.getAllByRole('listitem')).toHaveLength(2)
	},
}

/** One guide turn, cut where a model would still be typing it. Each cut leaves a
 * mark open, which is the case the renderer has to hold. */
const frames = [
	'The **Florida grasshopper',
	'The **Florida grasshopper sparrow** is the one with a series behind it — see the [Journal of Threatened Taxa](https://www.threa',
	'The **Florida grasshopper sparrow** is the one with a series behind it — see the [Journal of Threatened Taxa](https://www.threatenedtaxa.org) paper on the `diclofenac` collapse.',
]

export const Streaming: Story = {
	render: () => (
		<div className="flex w-[34rem] flex-col">
			{frames.map((text, index) => (
				<Row key={index} label={`Guide turn, ${index + 1} of ${frames.length}`}>
					<div aria-label={`Frame ${index + 1}`} className="w-full">
						<ChatMessage from="guide">{text}</ChatMessage>
					</div>
				</Row>
			))}
		</div>
	),
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement)

		// A mark the turn has not closed yet is closed for it, so the reader never
		// sees the asterisks or the half-typed URL that made the mark.
		for (const [index] of frames.entries()) {
			const frame = canvas.getByLabelText(`Frame ${index + 1}`)

			await expect(frame.textContent).not.toContain('**')
			await expect(frame.textContent).not.toContain('](')
			await expect(within(frame).getByText(/Florida grasshopper/).tagName).toBe('STRONG')
		}

		// The link is a link once its URL has landed, and not before.
		await expect(within(canvas.getByLabelText('Frame 2')).queryByRole('link')).toBeNull()
		await expect(
			within(canvas.getByLabelText('Frame 3')).getByRole('link', {
				name: 'Journal of Threatened Taxa',
			}),
		).toHaveAttribute('href', 'https://www.threatenedtaxa.org')
	},
}

export const Progress: Story = {
	render: () => (
		<div className="w-[24rem]">
			<Row label="Quiet — under target">
				<ProgressBar value={0.62} className="w-full" />
			</Row>
			<Row label="Attention — over target">
				<ProgressBar value={1.18} className="w-full" />
			</Row>
			<Row label="Length bar — the shape of the piece">
				<LengthBar
					segments={plan.outline.map((node) => ({
						label: node.title,
						words: node.target ?? 0,
						state: sectionState[node.id],
					}))}
					height={160}
					accentCurrent
				/>
			</Row>
		</div>
	),
}

export const Research: Story = {
	render: () => (
		<div className="flex w-[34rem] flex-col gap-4">
			{/* Undecided, so the Chat card shows the two rulings it offers. */}
			<ReferenceCard offer={offers[3]} favourite="publication" />
			<ReferenceCard offer={offers[0]} />
			<ReferenceCard offer={offers[2]} variant="ledger" />
			<ReferenceCard offer={offers[4]} variant="ledger" compact />
			<ReferenceCard offer={offers[6]} variant="ledger" compact />
			<Divider />
			<p className="max-w-[28rem] text-12 leading-relaxed text-muted">
				<strong>The QuoteRow component (2 examples below) is unused.</strong> It was added
				to show a read-only summary of the Plan Panel, which we stopped using, but may go
				back to in Phase 2.
			</p>
			<QuoteRow reference={plan.references[2]} section="§2" showUsage />
			<QuoteRow reference={plan.references[3]} showUsage />
		</div>
	),
}

export const Notes: Story = {
	render: () => (
		<div className="flex w-[16rem] flex-col gap-3">
			<GuidanceNote
				anchor="§3"
				confidence="confident"
				live
				title="You're restating §2"
				body="You're supposed to be moving into the human cost."
				actions={
					<>
						<Chip variant="outline" interactive>
							accept
						</Chip>
						<Chip variant="muted" interactive>
							decline
						</Chip>
					</>
				}
			/>
			<GuidanceNote
				anchor="whole piece"
				confidence="tentative"
				title="220 words over target"
				body="With §4 still to write, something in §3 has to give."
			/>
			<GuidanceNote title="Attribute the £4,100 figure in-sentence" accepted />
			<NoteDot count={3} className="self-start" />
		</div>
	),
}

export const PlanPieces: Story = {
	render: () => (
		<div className="flex w-[26rem] flex-col gap-4">
			<OutlineRow node={plan.outline[1]} ordinal="2" />
			<OutlineRow node={plan.outline[2]} ordinal="3" current />
			<OutlineRow node={plan.outline[3]} ordinal="4" dense />
			<div className="flex flex-col gap-2 pt-2">
				<PolarityHeading polarity="yes" count={3}>
					Sounds like this
				</PolarityHeading>
				<ExampleBlock
					polarity="yes"
					text="In 2006 the number was thirty-one. Last spring it was four."
					source="Why Cities Stopped Building, §1"
				/>
				<PolarityHeading polarity="no" count={2}>
					Not this
				</PolarityHeading>
				<ExampleBlock
					polarity="no"
					text="The situation is, frankly, an absolute disaster!"
					reason="just loud"
				/>
			</div>
		</div>
	),
}
