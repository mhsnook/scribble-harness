import type { ReactNode } from 'react'

import { Button } from '../../../src/client/components/Button'
import { Chip } from '../../../src/client/components/Chip'
import { Frame, FrameBody } from '../../../src/client/components/Frame'
import { BackLink, TitleBar } from '../../../src/client/components/TitleBar'
import { cx } from '../../../src/client/lib/cx'

export type SettingsTab = 'voices' | 'adjectives' | 'sources'

const TABS: SettingsTab[] = ['voices', 'adjectives', 'sources']

export interface SettingsListItem {
	id: string
	label: string
	/** A quiet group heading rendered above this item. */
	group?: string
}

export interface SettingsShellProps {
	tab: SettingsTab
	items: SettingsListItem[]
	selectedId: string
	addLabel: string
	listWidth?: number
	children: ReactNode
	/** Width of the whole window. */
	width?: number
}

/**
 * One shell, three lists. Writer settings is a master/detail: the thing you
 * are editing is highlighted in the rail because it is also what fills the
 * panel — the highlight is a location marker, not a call to action.
 */
export function SettingsShell({
	tab,
	items,
	selectedId,
	addLabel,
	listWidth = 168,
	children,
	width = 700,
}: SettingsShellProps) {
	return (
		<Frame width={width}>
			<TitleBar
				back={<BackLink to="/">Articles</BackLink>}
				title="Writer settings"
				actions={TABS.map((name) => (
					<Chip key={name} variant={name === tab ? 'solid' : 'outline'} interactive>
						{name}
					</Chip>
				))}
			/>
			<FrameBody row className="h-[19rem]">
				<nav
					className="flex shrink-0 flex-col gap-1 border-r border-edge bg-sunk p-3"
					style={{ width: listWidth }}
				>
					{items.map((item) => (
						<div key={item.id} className="flex flex-col gap-1">
							{item.group ? (
								<p className="label-meta pt-2 first:pt-0">{item.group}</p>
							) : null}
							<button
								type="button"
								aria-current={item.id === selectedId ? 'true' : undefined}
								className={cx(
									'-mx-1.5 rounded-md px-1.5 py-1 text-left text-13 transition-colors',
									item.id === selectedId
										? 'bg-accent font-medium text-accent-ink'
										: 'text-muted hover:bg-hush hover:text-ink',
								)}
							>
								{item.label}
							</button>
						</div>
					))}
					<Button size="sm" className="mt-2 self-start">
						{addLabel}
					</Button>
				</nav>
				<div className="flex min-w-0 flex-1 flex-col gap-3.5 p-4">{children}</div>
			</FrameBody>
		</Frame>
	)
}

export interface SettingsDetailHeaderProps {
	title: string
	usage: string
}

export function SettingsDetailHeader({ title, usage }: SettingsDetailHeaderProps) {
	return (
		<div className="flex items-baseline gap-2.5">
			<h3 className="text-[1rem] font-semibold text-ink">{title}</h3>
			<span className="text-12 text-faint">{usage}</span>
		</div>
	)
}

export interface RuleBlockProps {
	label: string
	children: ReactNode
}

/** The prompt / definition box: what the Guide is actually handed. */
export function RuleBlock({ label, children }: RuleBlockProps) {
	return (
		<div className="flex flex-col gap-1.5">
			<p className="label-meta">{label}</p>
			<p className="rounded-md border border-edge bg-sunk p-2.5 text-13 leading-relaxed text-ink">
				{children}
			</p>
		</div>
	)
}

export interface ScoreTestProps {
	score: string
	paragraph: string
}

/**
 * Paste a paragraph, get a score out of ten. This is how you check that your
 * own rule says what you think it says.
 */
export function ScoreTest({ score, paragraph }: ScoreTestProps) {
	return (
		<div className="flex items-center gap-3 rounded-md border border-edge bg-sunk p-2.5">
			<div className="flex min-w-0 flex-1 flex-col gap-1">
				<p className="label-meta">Paste to test a paragraph</p>
				<p className="truncate text-12 text-muted">{paragraph}</p>
			</div>
			<Chip variant="accent">{score}</Chip>
		</div>
	)
}
