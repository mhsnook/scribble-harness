import { Notice } from '../components/Notice'
import { Panel, PanelHeader, type PanelProps } from '../components/Panel'
import { useArticle } from '../lib/article'
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
			blocks={blocks}
			className={className}
			divider={divider}
			grow={grow}
			onAttach={attachEditor}
			onChange={touch}
			status={status}
		/>
	)
}
