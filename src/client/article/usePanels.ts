import { useEffect, useState } from 'react'

import { PANELS, type PanelId } from '../components/PanelRail'

/** Which Panels the Article screen shows, and the tabs a narrow one gets — §8. */

/** Below the md breakpoint (`--breakpoint-md`, theme.css) the rail shows one
 * Panel at a time. The query is the complement of Tailwind's `md:`. */
const narrowQuery = '(width < 768px)'

/** Which Panels are open is state about the Article. Nothing stores it beside
 * the Article yet, so it is held per Article in `localStorage` until there is
 * somewhere on the server to put it. */
const key = (articleId: string) => `scribble.open-panels.${articleId}`

/** Chat and Plan: what a writer who has never touched the rail opens on. */
const FIRST_OPEN: PanelId[] = ['chat', 'plan']

export type PanelState = {
	/** Which Panels are visible. All four stay mounted. */
	open: PanelId[]
	/** The rail is a set of tabs rather than a set of toggles. */
	narrow: boolean
	/** The Panel row's type-and-spacing scale — `panelScale`. */
	scale: number
	toggle: (panel: PanelId) => void
}

export function usePanels(articleId: string): PanelState {
	const narrow = useNarrow(narrowQuery)
	const [open, setOpen] = useState<PanelId[]>(() => loadOpenPanels(articleId))

	// A narrow window shows one Panel, the furthest left. `open` keeps the rest,
	// so widening gives them back.
	const shown = narrow && open.length > 1 ? [open[0]] : open

	// A narrow rail picks a tab out of necessity, and saving that one Panel as
	// the layout would open a wide window on one Panel too.
	useEffect(() => {
		if (!narrow) writeOpenPanels(articleId, open)
	}, [articleId, narrow, open])

	return {
		open: shown,
		narrow,
		scale: panelScale(open, narrow),
		toggle: (panel) => setOpen((held) => nextOpenPanels(held, panel, narrow)),
	}
}

function loadOpenPanels(articleId: string): PanelId[] {
	try {
		const stored = window.localStorage.getItem(key(articleId))
		const held: unknown = JSON.parse(stored ?? 'null')

		return readOpenPanels(held) ?? FIRST_OPEN
	} catch {
		return FIRST_OPEN
	}
}

function writeOpenPanels(articleId: string, open: readonly PanelId[]): void {
	try {
		window.localStorage.setItem(key(articleId), JSON.stringify(open))
	} catch {
		// Held for this session.
	}
}

/** Returns the saved layout, or `null`. */
export function readOpenPanels(value: unknown): PanelId[] | null {
	if (!Array.isArray(value)) return null

	const open = PANELS.filter((panel) => value.includes(panel))

	return open.length === 0 ? null : open
}

/** The Panel row's type-and-spacing scale — `.panel-scale` in theme.css reads
 * it as `--panel-scale`. Fewer open Panels leave more room; a narrow window
 * shows one Panel out of necessity, not room, so it stays compact. */
export function panelScale(open: readonly PanelId[], narrow: boolean): number {
	if (narrow || open.length > 2) return 1
	return open.length === 1 ? 1.25 : 1.125
}

/** Narrow selects; wide toggles, never down to nothing, and always back into the
 * rail's own order. */
export function nextOpenPanels(
	held: readonly PanelId[],
	panel: PanelId,
	narrow: boolean,
): PanelId[] {
	if (narrow) return [panel]

	if (held.includes(panel)) {
		return held.length === 1 ? [...held] : held.filter((one) => one !== panel)
	}

	return PANELS.filter((one) => one === panel || held.includes(one))
}

/** What the Draft's neighbours are worth against each other. The Draft is the
 * writing surface and everything else supports it, so it takes twice what a
 * supporting Panel does. */
const WEIGHTS: Record<Exclude<PanelId, 'notes'>, number> = {
	chat: 1,
	plan: 1,
	draft: 2,
}

/** Notes is the margin rail — screen 3(e) — so it takes a slice off the top
 * rather than a share of the split. It gets the wider slice when it is the one
 * Panel beside another, and the narrow one when it is a fourth column. */
const NOTES_ALONE = 0.25
const NOTES_WITH_OTHERS = 0.2

/**
 * The fraction of the Panel row one open Panel takes. Flex reads these as
 * ratios against each other, so the fractions can be handed to it directly.
 *
 * Notes is fixed first, and the Draft takes twice what a supporting Panel does
 * out of what is left. That gives 33/67 for Plan + Draft, 25/25/50 for Chat +
 * Plan + Draft, 20/20/40/20 for all four, and 75/25 for Draft + Notes.
 *
 * A hidden Panel gets 0. It is still mounted, but `Activity` has taken it out
 * of the layout, so nothing reads the number.
 */
export function panelShare(open: readonly PanelId[], panel: PanelId): number {
	if (!open.includes(panel)) return 0
	if (open.length === 1) return 1

	const notes = open.includes('notes')
		? open.length === 2
			? NOTES_ALONE
			: NOTES_WITH_OTHERS
		: 0

	if (panel === 'notes') return notes

	const rest = open.filter((one) => one !== 'notes') as Exclude<PanelId, 'notes'>[]
	const total = rest.reduce((sum, one) => sum + WEIGHTS[one], 0)

	return ((1 - notes) * WEIGHTS[panel]) / total
}

function useNarrow(query: string): boolean {
	const [narrow, setNarrow] = useState(() => window.matchMedia(query).matches)

	useEffect(() => {
		const media = window.matchMedia(query)
		const read = () => setNarrow(media.matches)

		read()
		media.addEventListener('change', read)

		return () => media.removeEventListener('change', read)
	}, [query])

	return narrow
}
