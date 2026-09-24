import { useState } from 'react'

import { Notice } from '../components/Notice'
import { Panel, PanelHeader, type PanelProps } from '../components/Panel'
import { useArticle } from '../lib/article'
import { useMarginNotes } from '../notes/useMarginNotes'
import { DraftPanel } from './DraftPanel'
import { useDraft } from './useDraft'

/** Drives `DraftPanel` from the connection the `ArticleProvider` holds. */

export interface ArticleDraftPanelProps {
	divider?: PanelProps['divider']
	/** This Panel's share of the Panel row — `panelShare`. */
	grow?: PanelProps['grow']
	className?: string
}

export function ArticleDraftPanel({ divider, grow, className }: ArticleDraftPanelProps) {
	const { blocks, failure, status, attachEditor, touch } = useDraft(useArticle().draft)

	// Reuses the Draft's own Notice to show a margin ruling's failure, because it
	// fails the same way one made in the Notes Panel does.
	const [refused, setRefused] = useState<string | null>(null)
	const margin = useMarginNotes(setRefused)

	// The editor is built from the Blocks and reads them once, so it mounts
	// after they arrive rather than being filled in afterwards. Loading it late
	// would push the whole Draft onto the undo stack and schedule a save of
	// what had just been read.
	if (blocks === null) {
		return (
			<Panel className={className} divider={divider} grow={grow}>
				<PanelHeader title="Draft" />
				{failure === null ? (
					<p className="text-12 text-faint">Opening the Draft…</p>
				) : (
					<Notice>{failure}</Notice>
				)}
			</Panel>
		)
	}

	return (
		<DraftPanel
			anchored={margin.blockIds}
			blocks={blocks}
			className={className}
			divider={divider}
			failure={refused}
			grow={grow}
			noteActions={margin.actions}
			notes={margin.notes}
			onAttach={attachEditor}
			onChange={touch}
			status={status}
		/>
	)
}
