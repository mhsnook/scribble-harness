import { Activity, type CSSProperties } from 'react'

import { ArticleChatPanel } from '../chat/ArticleChatPanel'
import { PANELS, type PanelId } from '../components/PanelRail'
import { ArticleDraftPanel } from '../draft/ArticleDraftPanel'
import type { ArticleSocket } from '../lib/useArticleAgent'
import { ArticleNotesPanel } from '../notes/ArticleNotesPanel'
import { ArticlePlanPanel } from '../plan/ArticlePlanPanel'
import { panelShare } from './usePanels'

/**
 * The four Panels of the Article screen — architecture.md §8. This row is what
 * gives them a height to scroll their own Y within.
 *
 * How wide each one gets is `panelShare`, which reads the whole open set: the
 * Draft's share depends on what is beside it.
 */

export interface ArticlePanelsProps {
	agent: ArticleSocket
	/** Already in chat → plan → draft → notes order; `usePanels` keeps it there. */
	open: readonly PanelId[]
	/** The row's type-and-spacing scale — `panelScale` in usePanels. */
	scale: number
}

export function ArticlePanels({ agent, open, scale }: ArticlePanelsProps) {
	return (
		<div
			className="panel-scale flex min-h-0 flex-auto"
			style={{ '--panel-scale': scale } as CSSProperties}
		>
			{PANELS.map((panel) => {
				// `open` is in rail order, so anything past the first has a Panel on
				// its left to draw a rule against.
				const at = open.indexOf(panel)

				return (
					<Activity key={panel} mode={at === -1 ? 'hidden' : 'visible'}>
						<PanelFor
							agent={agent}
							divided={at > 0}
							grow={panelShare(open, panel)}
							panel={panel}
						/>
					</Activity>
				)
			})}
		</div>
	)
}

function PanelFor({
	agent,
	divided,
	grow,
	panel,
}: {
	agent: ArticleSocket
	divided: boolean
	/** This Panel's share of the row — `panelShare`. */
	grow: number
	panel: PanelId
}) {
	const edge = divided ? 'left' : 'none'

	switch (panel) {
		case 'chat':
			return <ArticleChatPanel agent={agent} divider={edge} grow={grow} />

		case 'plan':
			return <ArticlePlanPanel divider={edge} grow={grow} />

		case 'draft':
			return <ArticleDraftPanel divider={edge} grow={grow} />

		case 'notes':
			return <ArticleNotesPanel divider={edge} grow={grow} />
	}
}
