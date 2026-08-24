import { Link } from '@tanstack/react-router'

import {
	type ArticleEntry,
	articleTitle,
	isUntitled,
	statusLabel,
	statusProgress,
} from '../../shared/article'
import { cx } from '../lib/cx'
import { shortDate } from '../lib/when'
import { Chip } from './Chip'
import { ProgressBar } from './ProgressBar'

export interface ArticleCardProps {
	article: ArticleEntry
	/** `card` is the index's tile; `column` is the Board View's smaller one. */
	variant?: 'card' | 'column'
	className?: string
}

/**
 * One Article, as the index knows it. Nothing here reaches into an Article Agent
 * to count words or read the Plan, so a title, a status, and the day it started
 * is the whole of what a tile can say — and "started" rather than "last worked
 * on", which the index has no honest answer for.
 *
 * The bar is the status's place along the Board's columns, unlabelled: the word
 * beside it is the signal and the bar is a shape. The Board's own tiles drop
 * both, since the column they sit in already names the status.
 */
export function ArticleCard({ article, variant = 'card', className }: ArticleCardProps) {
	const compact = variant === 'column'

	return (
		<Link
			className={cx(
				'flex flex-col items-stretch rounded-lg border border-edge bg-surface text-left transition-colors hover:border-ink/40 hover:bg-hush',
				compact ? 'gap-1.5 p-2.5' : 'w-[13.5rem] gap-2.5 p-3.5',
				className,
			)}
			params={{ articleId: article.id }}
			to="/a/$articleId"
		>
			<h3
				className={cx(
					'leading-snug break-words',
					compact ? 'text-13' : 'line-clamp-3 text-15',
					isUntitled(article.title) ? 'text-faint' : 'font-semibold text-ink',
				)}
			>
				{articleTitle(article)}
			</h3>

			{compact ? null : (
				<ProgressBar
					label={`Status: ${statusLabel[article.status]}`}
					value={statusProgress(article.status)}
				/>
			)}

			<div className="flex flex-wrap items-center gap-x-2 gap-y-1">
				{compact ? null : <Chip variant="outline">{statusLabel[article.status]}</Chip>}
				<span className="text-11 text-faint">started {shortDate(article.createdAt)}</span>
			</div>
		</Link>
	)
}
