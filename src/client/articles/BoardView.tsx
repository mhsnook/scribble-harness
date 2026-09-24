import type { ArticleEntry } from '../../shared/article'
import { ArticleCard } from '../components/ArticleCard'
import { Button } from '../components/Button'
import { FrameBody } from '../components/Frame'
import { MetaLabel } from '../components/MetaLabel'
import { Notice } from '../components/Notice'
import { BackLink, TitleBar } from '../components/TitleBar'
import { cx } from '../lib/cx'
import { boardColumns } from './grouping'

const columnWidth = 'w-[clamp(16rem,30%,307px)] lg:w-auto lg:grow lg:basis-0'

const columnDivider =
	'before:absolute before:top-0 before:-left-1.5 before:h-40 before:w-px before:bg-rule'

/**
 * The Board View: the same unarchived Articles the list shows, by status.
 *
 * **Reading only** — no drag-and-drop, and no control on a card, because the
 * writer sets a status on the Article screen, the screen they're on when they
 * decide the piece has moved on.
 */

export interface BoardViewProps {
	articles: readonly ArticleEntry[]
	/** Why a write did not land. A read failure skips this prop, because it
	 * replaces the whole screen instead. */
	failure?: string | null
	onNew?: () => void
}

export function BoardView({ articles, failure = null, onNew }: BoardViewProps) {
	const columns = boardColumns(articles)

	return (
		<>
			<TitleBar
				actions={
					<Button onClick={onNew} size="sm" variant="accent">
						+ new article
					</Button>
				}
				back={<BackLink to="/">Articles</BackLink>}
				subtitle="by status"
				title="Board"
			/>
			{failure === null ? null : (
				<div className="px-4 pt-4">
					<Notice>{failure}</Notice>
				</div>
			)}
			<FrameBody className="gap-3 overflow-x-auto p-4" row>
				{columns.map((column, index) => (
					// A divider in the gutter and a rule under the label, so four columns
					// read as four. The column itself draws nothing, which is what lets
					// the gutter stay this narrow: the tiles are the only boxes here.
					<div
						className={cx(
							'relative flex shrink-0 flex-col gap-2',
							columnWidth,
							index === 0 ? null : columnDivider,
						)}
						key={column.status}
					>
						{/* The negative margin runs the rule to the middle of each gutter,
						    so the four rules meet and read as one line. */}
						<MetaLabel
							className="-mx-1.5 shrink-0 border-b border-rule px-1.5 py-1.5"
							count={column.articles.length}
						>
							{column.label}
						</MetaLabel>
						<div className="flex min-h-0 flex-col gap-2 overflow-y-auto">
							{column.articles.map((article) => (
								<ArticleCard
									article={article}
									className="shrink-0"
									key={article.id}
									variant="column"
								/>
							))}
						</div>
					</div>
				))}
			</FrameBody>
		</>
	)
}
