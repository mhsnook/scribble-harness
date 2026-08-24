import { Link } from '@tanstack/react-router'
import { Columns3 } from 'lucide-react'
import type { ReactNode } from 'react'

import type { ArticleEntry } from '../../shared/article'
import { articleTitle, isUntitled, statusLabel } from '../../shared/article'
import { ArticleCard } from '../components/ArticleCard'
import { Button, buttonClass } from '../components/Button'
import { Chip } from '../components/Chip'
import { GroupHeading } from '../components/Divider'
import { EmptySlot } from '../components/Field'
import { FrameBody } from '../components/Frame'
import { Notice } from '../components/Notice'
import { TitleBar } from '../components/TitleBar'
import { cx } from '../lib/cx'
import { shortDate } from '../lib/when'
import { archivedArticles, recentArticles, unarchivedArticles } from './grouping'

/**
 * The Articles Area, as a list. The Board View lays the same rows out by status.
 *
 * The tiles on top supplement the list rather than replacing rows in it, and
 * Archived Articles are a group at its foot rather than a View of their own.
 */

export interface ArticleListProps {
	articles: readonly ArticleEntry[]
	/** Why a write did not land. The read's own failure replaces the screen. */
	failure?: string | null
	onNew?: () => void
	onRestore?: (id: string) => void
}

export function ArticleList({
	articles,
	failure = null,
	onNew,
	onRestore,
}: ArticleListProps) {
	const working = unarchivedArticles(articles)
	const recent = recentArticles(articles)
	const archived = archivedArticles(articles)

	return (
		<>
			<TitleBar
				title="Articles"
				actions={
					<>
						<Link className={buttonClass({ size: 'sm', variant: 'quiet' })} to="/board">
							<Columns3 aria-hidden className="size-3.5" />
							board view
						</Link>
						<Button onClick={onNew} size="sm" variant="accent">
							+ new article
						</Button>
					</>
				}
			/>
			<FrameBody className="gap-6 overflow-y-auto p-4">
				{failure === null ? null : <Notice>{failure}</Notice>}

				{recent.length === 0 ? null : (
					<div className="flex flex-col gap-3">
						<GroupHeading>Recent</GroupHeading>
						<div className="flex flex-wrap gap-3">
							{recent.map((article) => (
								<ArticleCard article={article} key={article.id} />
							))}
						</div>
					</div>
				)}

				<div className="flex flex-col gap-1.5">
					<GroupHeading count={working.length}>In progress</GroupHeading>
					{working.length === 0 ? (
						<EmptySlot className="min-h-[3.5rem]">
							Nothing here yet — start an Article and it appears in this list
						</EmptySlot>
					) : (
						// Pulled out, so a row's fill runs the width of the page while its
						// title stays under the heading.
						<div className="-mx-2.5 flex flex-col">
							{working.map((article) => (
								<ArticleRow article={article} key={article.id} when={article.createdAt} />
							))}
						</div>
					)}
				</div>

				{archived.length === 0 ? null : (
					<div className="flex flex-col gap-1.5">
						<GroupHeading count={archived.length}>Archived</GroupHeading>
						<div className="-mx-2.5 flex flex-col">
							{archived.map((article) => (
								<ArticleRow
									action={
										<Button
											onClick={() => onRestore?.(article.id)}
											size="sm"
											variant="quiet"
										>
											restore
										</Button>
									}
									article={article}
									dimmed
									key={article.id}
									when={article.archivedAt ?? article.createdAt}
								/>
							))}
						</div>
					</div>
				)}
			</FrameBody>
		</>
	)
}

/**
 * One line of either list. **No rule between rows**: a hairline separates the
 * sections of a page here, and one between every Article turns a list of pieces
 * into a table of records. The hover fill is what separates two rows, and what
 * says the whole row opens.
 *
 * The title's overlay carries that hit area across the row, so `action` needs
 * `relative` to stay above it.
 */
function ArticleRow({
	article,
	when,
	action,
	dimmed = false,
}: {
	article: ArticleEntry
	when: number
	action?: ReactNode
	dimmed?: boolean
}) {
	return (
		<div
			className={cx(
				'relative flex items-center gap-3 rounded-md px-2.5 py-2.5 transition-colors hover:bg-hush',
				dimmed && 'opacity-70',
			)}
		>
			{/* The clip goes on the text: an overlay inside an `overflow-hidden` box
			    is clipped to it, and would cover the title alone. */}
			<Link
				className="min-w-0 flex-1 text-left after:absolute after:inset-0"
				params={{ articleId: article.id }}
				to="/a/$articleId"
			>
				<span
					className={cx(
						'block truncate text-14',
						isUntitled(article.title) ? 'text-faint' : 'text-ink',
					)}
				>
					{articleTitle(article)}
				</span>
			</Link>
			<Chip variant="outline">{statusLabel[article.status]}</Chip>
			{/* Fixed width, so dates of different lengths leave the chips in line. */}
			<span className="w-12 shrink-0 text-right text-11 text-faint">
				{shortDate(when)}
			</span>
			{action ? <span className="relative shrink-0">{action}</span> : null}
		</div>
	)
}
