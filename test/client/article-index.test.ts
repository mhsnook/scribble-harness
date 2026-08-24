import { describe, expect, it } from 'vitest'

import {
	nextOpenPanels,
	panelShare,
	readOpenPanels,
} from '../../src/client/article/usePanels'
import {
	archivedArticles,
	boardColumns,
	recentArticles,
	unarchivedArticles,
} from '../../src/client/articles/grouping'
import type { PanelId } from '../../src/client/components/PanelRail'
import { shortDate } from '../../src/client/lib/when'
import {
	type ArticleEntry,
	type ArticleStatus,
	articleEditSchema,
	articleTitle,
	untitledArticle,
} from '../../src/shared/article'

/** The arithmetic behind the two Views on the article index, and the rail that
 * decides which Panels an Article screen shows. */

function entry(
	id: string,
	status: ArticleStatus,
	archivedAt: number | null = null,
): ArticleEntry {
	return { id, title: id, status, createdAt: 1, updatedAt: 1, archivedAt }
}

describe('splitting the index', () => {
	const articles = [
		entry('a', 'planning'),
		entry('b', 'drafting', 200),
		entry('c', 'done'),
	]

	it('leaves an Archived Article out of what is in progress', () => {
		expect(unarchivedArticles(articles).map((one) => one.id)).toEqual(['a', 'c'])
	})

	it('gathers the Archived ones', () => {
		expect(archivedArticles(articles).map((one) => one.id)).toEqual(['b'])
	})
})

describe('the tiles on top of the list', () => {
	const articles = [
		entry('a', 'planning'),
		entry('b', 'drafting'),
		entry('c', 'done'),
		entry('d', 'planning'),
	]

	it('highlights the few the writer touched last', () => {
		expect(recentArticles(articles, 3).map((one) => one.id)).toEqual(['a', 'b', 'c'])
	})

	// Sorted in the View rather than left to the index route's ORDER BY, so
	// paginating the read cannot turn these into "the first three rows".
	it('orders by when the row last changed, not by the order it arrived in', () => {
		const older = { ...entry('older', 'planning'), updatedAt: 10 }
		const newer = { ...entry('newer', 'planning'), updatedAt: 20 }

		expect(recentArticles([older, newer], 2).map((one) => one.id)).toEqual([
			'newer',
			'older',
		])
	})

	it('leaves every one of them in the list underneath', () => {
		const listed = unarchivedArticles(articles).map((one) => one.id)

		for (const article of recentArticles(articles, 3)) {
			expect(listed).toContain(article.id)
		}
		expect(listed).toHaveLength(4)
	})

	it('never highlights an Archived Article', () => {
		expect(recentArticles([entry('z', 'drafting', 200), ...articles], 2)).toHaveLength(2)
		expect(recentArticles([entry('z', 'drafting', 200), ...articles], 2)[0].id).toBe('a')
	})

	it('takes what there is where there are fewer', () => {
		expect(recentArticles([entry('a', 'planning')], 3)).toHaveLength(1)
	})
})

describe('the Board View’s columns', () => {
	it('draws every status, empty ones included', () => {
		const columns = boardColumns([entry('a', 'planning')])

		expect(columns.map((column) => column.status)).toEqual([
			'planning',
			'drafting',
			'self-edit',
			'done',
		])
		expect(columns.map((column) => column.articles.length)).toEqual([1, 0, 0, 0])
	})

	it('keeps a Done Article on the Board until it is Archived', () => {
		const [, , , done] = boardColumns([entry('a', 'done')])

		expect(done.articles.map((one) => one.id)).toEqual(['a'])
	})

	it('drops an Archived Article from every column', () => {
		const columns = boardColumns([entry('a', 'drafting', 200)])

		expect(columns.every((column) => column.articles.length === 0)).toBe(true)
	})

	it('names each column for a reader rather than by its key', () => {
		expect(boardColumns([]).map((column) => column.label)).toEqual([
			'Planning',
			'Drafting',
			'Self-edit',
			'Done',
		])
	})
})

describe('an Article with no title', () => {
	it('reads as untitled rather than as an empty row', () => {
		expect(articleTitle(entry('a', 'planning'))).toBe('a')
		expect(articleTitle({ ...entry('a', 'planning'), title: '   ' })).toBe(
			untitledArticle,
		)
	})
})

describe('editing a row', () => {
	it('refuses an edit that changes nothing', () => {
		expect(articleEditSchema.safeParse({}).success).toBe(false)
	})

	it('takes one field on its own', () => {
		expect(articleEditSchema.safeParse({ archived: true }).success).toBe(true)
	})

	it('refuses a status the Board has no column for', () => {
		expect(articleEditSchema.safeParse({ status: 'shipped' }).success).toBe(false)
	})
})

describe('the Panel rail', () => {
	it('selects one Panel on a narrow screen', () => {
		expect(nextOpenPanels(['chat', 'plan'], 'notes', true)).toEqual(['notes'])
	})

	it('opens a Panel into its own place in the order', () => {
		expect(nextOpenPanels(['chat', 'notes'], 'plan', false)).toEqual([
			'chat',
			'plan',
			'notes',
		])
	})

	it('closes a Panel that is open', () => {
		expect(nextOpenPanels(['chat', 'plan'], 'chat', false)).toEqual(['plan'])
	})

	it('keeps the last Panel open rather than leaving nothing on screen', () => {
		expect(nextOpenPanels(['plan'], 'plan', false)).toEqual(['plan'])
	})
})

describe('the layout a writer left open', () => {
	it('reads a saved layout back into the rail order', () => {
		expect(readOpenPanels(['notes', 'chat'])).toEqual(['chat', 'notes'])
	})

	it('has no layout to read on a first visit', () => {
		expect(readOpenPanels(null)).toBe(null)
	})

	it('drops a Panel the app no longer has', () => {
		expect(readOpenPanels(['plan', 'outline'])).toEqual(['plan'])
	})

	it('refuses a set that would leave nothing on screen', () => {
		expect(readOpenPanels([])).toBe(null)
		expect(readOpenPanels(['outline'])).toBe(null)
	})

	it('refuses a stored value that is not a list', () => {
		expect(readOpenPanels('chat')).toBe(null)
	})
})

describe('how wide each Panel gets', () => {
	/** Reads the whole row at once, which is what the shares are about. */
	const shares = (open: PanelId[]) => open.map((panel) => panelShare(open, panel))

	it('gives one Panel the whole row', () => {
		expect(shares(['draft'])).toEqual([1])
		expect(shares(['notes'])).toEqual([1])
	})

	it('gives the Draft twice what a supporting Panel gets', () => {
		expect(shares(['plan', 'draft'])).toEqual([1 / 3, 2 / 3])
		expect(shares(['chat', 'plan', 'draft'])).toEqual([0.25, 0.25, 0.5])
	})

	it('keeps Notes narrow and splits what is left', () => {
		expect(shares(['draft', 'notes'])).toEqual([0.75, 0.25])
		expect(shares(['chat', 'plan', 'draft', 'notes'])).toEqual([0.2, 0.2, 0.4, 0.2])
	})

	it('adds up to the whole row', () => {
		const total = shares(['chat', 'plan', 'draft', 'notes']).reduce(
			(sum, share) => sum + share,
			0,
		)

		expect(total).toBeCloseTo(1)
	})

	it('gives a hidden Panel nothing, since nothing reads it', () => {
		expect(panelShare(['chat', 'draft'], 'notes')).toBe(0)
	})
})

describe('a date in a list', () => {
	it('leaves this year off and states any other', () => {
		const inYear = Date.UTC(2026, 2, 4)
		const before = Date.UTC(2025, 2, 4)

		expect(shortDate(inYear, Date.UTC(2026, 7, 8))).toBe('4 mar')
		expect(shortDate(before, Date.UTC(2026, 7, 8))).toBe('4 mar 2025')
	})
})
