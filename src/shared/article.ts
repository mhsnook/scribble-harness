import { z } from 'zod'

/**
 * The article index: one row per Article, and the only record of an Article that
 * lives outside its Article Agent. What it may and may not carry, and why the
 * title lives in two places, is docs/architecture.md §4.6.
 */

/** Nothing infers this — 1a has no Draft to measure, so the writer sets it. */
export const articleStatusSchema = z.enum(['planning', 'drafting', 'self-edit', 'done'])
export type ArticleStatus = z.infer<typeof articleStatusSchema>

/** Load-bearing order: the Board View's columns, and a new Article's first. */
export const ARTICLE_STATUSES = articleStatusSchema.options

export const statusLabel: Record<ArticleStatus, string> = {
	planning: 'Planning',
	drafting: 'Drafting',
	'self-edit': 'Self-edit',
	done: 'Done',
}

export const articleEntrySchema = z.strictObject({
	id: z.string().min(1),
	/** A copy. The Plan holds the real title. */
	title: z.string(),
	status: articleStatusSchema,
	createdAt: z.number().int(),
	/** When the row changed, which is not when the Article was worked on: a Plan
	 * edit goes to the Article Agent and never touches this table. */
	updatedAt: z.number().int(),
	archivedAt: z.number().int().nullable(),
})

export type ArticleEntry = z.infer<typeof articleEntrySchema>

export const articleListSchema = z.object({ articles: z.array(articleEntrySchema) })

export const articleReplySchema = z.object({ article: articleEntrySchema })

export const newArticleSchema = z.strictObject({ title: z.string().optional() })

export const articleEditSchema = z
	.strictObject({
		title: z.string().optional(),
		status: articleStatusSchema.optional(),
		archived: z.boolean().optional(),
	})
	.refine((edit) => Object.values(edit).some((field) => field !== undefined), {
		error: 'An edit changes at least one of title, status, or archived.',
	})

export type ArticleEdit = z.infer<typeof articleEditSchema>

/** The Plan Panel's placeholder reads the same, because it is the same absence. */
export const untitledArticle = 'Untitled article'

export function isUntitled(title: string): boolean {
	return title.trim() === ''
}

export function displayTitle(title: string): string {
	return isUntitled(title) ? untitledArticle : title
}

export function articleTitle(article: ArticleEntry): string {
	return displayTitle(article.title)
}

export function isArchived(article: ArticleEntry): boolean {
	return article.archivedAt !== null
}

/** A status's place along the Board's columns, for a bar to draw. */
export function statusProgress(status: ArticleStatus): number {
	return (ARTICLE_STATUSES.indexOf(status) + 1) / ARTICLE_STATUSES.length
}
