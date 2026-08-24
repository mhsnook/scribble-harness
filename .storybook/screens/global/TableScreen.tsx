import { Chip } from '../../../src/client/components/Chip'
import { Frame, FrameBody } from '../../../src/client/components/Frame'
import { BackLink, TitleBar } from '../../../src/client/components/TitleBar'

interface Row {
	title: string
	status: string
	words: string
	touched: string
	attention?: boolean
}

const rows: Row[] = [
	{
		title: 'The Long Tail of Batteries',
		status: 'drafting',
		words: '1,480',
		touched: '2h',
	},
	{ title: 'Why Cities Stopped Building', status: 'planning', words: '—', touched: '1d' },
	{
		title: 'Notes on Slow Software',
		status: 'self-edit',
		words: '2,610',
		touched: '3d',
		attention: true,
	},
	{ title: 'The Quiet Part of the Grid', status: 'sent', words: '3,100', touched: '1w' },
	{
		title: 'Everyone Is a Logistics Company',
		status: 'draft',
		words: '640',
		touched: '2mo',
	},
	{
		title: 'A Short History of the Loading Dock',
		status: 'published',
		words: '2,240',
		touched: '4mo',
	},
]

/**
 * 1(c) — All articles, as a table. Not an attraction: a familiar fallback
 * utility view, reached from "see all" links with the filter already set.
 */
export function TableScreen() {
	return (
		<Frame width={620}>
			<TitleBar
				back={<BackLink to="/">Articles</BackLink>}
				title="All articles"
				actions={
					<>
						<Chip variant="solid" interactive>
							open
						</Chip>
						<Chip variant="outline" interactive>
							drafts
						</Chip>
						<Chip variant="outline" interactive>
							published
						</Chip>
					</>
				}
			/>
			<FrameBody className="gap-0 px-4 py-3">
				<div className="flex items-baseline gap-3 border-b border-edge pb-2">
					<span className="label-meta flex-1">Title</span>
					<span className="label-meta w-20">Status</span>
					<span className="label-meta w-14 text-right">Words</span>
					<span className="label-meta w-10 text-right">Touch</span>
				</div>
				{rows.map((row) => (
					<div
						key={row.title}
						className="flex items-baseline gap-3 border-b border-rule py-2.5"
					>
						<span className="min-w-0 flex-1 truncate text-13 text-ink">{row.title}</span>
						<span className="w-20">
							{row.attention ? (
								<Chip variant="accent">{row.status}</Chip>
							) : (
								<span className="text-12 text-muted">{row.status}</span>
							)}
						</span>
						<span className="w-14 text-right font-mono text-11 text-faint">
							{row.words}
						</span>
						<span className="w-10 text-right font-mono text-11 text-faint">
							{row.touched}
						</span>
					</div>
				))}
				<p className="pt-3 text-11 text-faint">+ 18 more · sorted by last touched</p>
			</FrameBody>
		</Frame>
	)
}
