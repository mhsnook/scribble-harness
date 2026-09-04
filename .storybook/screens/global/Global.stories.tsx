import type { Meta, StoryObj } from '@storybook/react-vite'

import { Annotation } from '../../../src/client/components/Annotation'
import { AdjectivesScreen } from './AdjectivesScreen'
import { ArticlesScreen } from './ArticlesScreen'
import { BoardScreen } from './BoardScreen'
import { FavouriteSourcesScreen } from './FavouriteSourcesScreen'
import { HouseScreen } from './HouseScreen'
import { TableScreen } from './TableScreen'
import { VoicesScreen } from './VoicesScreen'

const meta = {
	title: 'Screens/1 Global',
	parameters: {
		layout: 'centered',
	},
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const A_Articles: Story = {
	name: '1(a) Articles',
	render: () => (
		<div className="flex flex-col">
			<ArticlesScreen />
			<Annotation>
				The root screen, and the live one — this is the same `ArticleList` the `/` route
				renders, against mock rows in the shape the D1 table holds. The tiles on top are
				the three the writer touched last, and each is still listed underneath: a tile is
				a shortcut rather than a row lifted out of the list, so scanning the list never
				means remembering what is missing from it. The Board View and the table both
				back-button here, so this is the only page that needs a "board view" button.
				Archived Articles are a group at the foot rather than a View of their own: they
				sit on the same table.
			</Annotation>
		</div>
	),
}

export const B_Board: Story = {
	name: '1(b) Board',
	render: () => (
		<div className="flex flex-col">
			<BoardScreen />
			<Annotation>
				Reading only. No drag-and-drop: the writer sets an Article's status on the Article
				screen, which is where they are when they decide it has moved on. A hairline in
				the gutter separates the columns, running a little past the first card — enough to
				read four columns as four without a fill behind each. The columns scale with the
				window and the Board scrolls sideways rather than squeezing four columns into a
				phone.
			</Annotation>
		</div>
	),
}

export const C_Table: Story = {
	name: '1(c) Table',
	render: () => <TableScreen />,
}

export const D_Voices: Story = {
	name: '1(d) Settings · voices',
	render: () => (
		<div className="flex flex-col">
			<VoicesScreen />
			<Annotation>
				The test row at the bottom takes a pasted paragraph and scores it. An exemplary
				paragraph should score very high — if it doesn't, the rule above is the thing that
				needs rewriting.
			</Annotation>
		</div>
	),
}

export const E_Adjectives: Story = {
	name: '1(e) Settings · adjectives',
	render: () => (
		<div className="flex flex-col">
			<AdjectivesScreen />
			<Annotation>
				Same shell as voices, deliberately. An adjective is just a fuzzier voice: you
				define what "high energy" means once, and then any section can be marked with it.
			</Annotation>
		</div>
	),
}

export const F_FavouriteSources: Story = {
	name: '1(f) Settings · favourite sources',
	render: () => (
		<div className="flex flex-col">
			<FavouriteSourcesScreen />
			<Annotation>
				Ranking, not filtering — a non-favourite still shows up when it is the best
				evidence available.
			</Annotation>
		</div>
	),
}

export const G_House: Story = {
	name: '1(g) House',
	render: () => (
		<div className="flex flex-col">
			<HouseScreen />
			<Annotation>
				The live screen — `/house` renders this same component against the room's own
				rows. It is what shipped of the three settings mockups above: a Voice is a string
				the writer types rather than a record with its own prompt and examples, so the
				Tone here is two fields rather than a library. The Lexicon and the standing rules
				are the material the guide reads on every turn, which is why they lead; the Skills
				are saved from a Review and only dropped here.
			</Annotation>
		</div>
	),
}
