import {
	type QueryClient,
	queryOptions,
	useMutation,
	useQuery,
	useQueryClient,
	useSuspenseQuery,
} from '@tanstack/react-query'

import type { ArticleEdit, ArticleEntry } from '../../shared/article'
import { failureText } from '../lib/failure'
import { editArticle, fetchArticles } from './api'

/**
 * The article index through TanStack Query — `docs/articles.md`. One key holds the whole table:
 * one Team's index is small enough to send whole, and both Views read it.
 */

export const articlesKey = ['articles'] as const

/** Named once, so a route's loader primes exactly what its component reads. */
export const articlesQuery = queryOptions({
	queryKey: articlesKey,
	queryFn: fetchArticles,
})

/** Splices a row into the cached list. */
export function keepArticle(client: QueryClient, article: ArticleEntry): void {
	client.setQueryData<ArticleEntry[]>(articlesKey, (held) => {
		const rows = held ?? []
		const at = rows.findIndex((one) => one.id === article.id)

		return at === -1 ? [article, ...rows] : rows.toSpliced(at, 1, article)
	})
}

/** The other half, for a row the writer discarded. */
export function dropArticle(client: QueryClient, id: string): void {
	client.setQueryData<ArticleEntry[]>(articlesKey, (held) =>
		(held ?? []).filter((one) => one.id !== id),
	)
}

export type ArticleWriter = {
	edit: (id: string, edit: ArticleEdit) => void
	/** Why the last write did not land. */
	failure: string | null
}

/** Changing a row, for any screen that has one to change. */
export function useEditArticle(): ArticleWriter {
	const client = useQueryClient()

	const edited = useMutation({
		mutationFn: ({ id, edit }: { id: string; edit: ArticleEdit }) =>
			editArticle(id, edit),
		onSuccess: (article) => keepArticle(client, article),
	})

	return {
		edit: (id, edit) => edited.mutate({ id, edit }),
		failure: failureText("That change didn't save.", edited.error),
	}
}

export type ArticleIndex = ArticleWriter & { articles: ArticleEntry[] }

export function useArticleIndex(): ArticleIndex {
	const { data } = useSuspenseQuery(articlesQuery)

	return { articles: data, ...useEditArticle() }
}

export function useArticleEntry(id: string): ArticleEntry | undefined {
	const { data } = useQuery({
		...articlesQuery,
		select: (articles) => articles.find((article) => article.id === id),
	})

	return data
}
