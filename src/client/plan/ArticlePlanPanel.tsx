import { Panel } from '../components/Panel'
import { useHouseStyle } from '../house/useHouse'
import { useArticle } from '../lib/article'
import { PlanPanel, type PlanPanelProps } from './PlanPanel'

/** Drives `PlanPanel` from the connection the `ArticleProvider` holds. */

export interface ArticlePlanPanelProps {
	divider?: PlanPanelProps['divider']
	/** This Panel's share of the Panel row — `panelShare`. */
	grow?: PlanPanelProps['grow']
	className?: string
}

export function ArticlePlanPanel({ divider, grow, className }: ArticlePlanPanelProps) {
	const { plan, edit, refusal, rejected } = useArticle().plan
	const houseStyle = useHouseStyle()

	// Says what it waits on rather than drawing a skeleton, since the socket
	// settles well inside a second.
	if (plan === null) {
		return (
			<Panel className={className} divider={divider} grow={grow} variant="sunk">
				<p className="text-12 text-faint">Opening the Plan…</p>
			</Panel>
		)
	}

	return (
		<PlanPanel
			className={className}
			divider={divider}
			edit={edit}
			grow={grow}
			houseStyle={houseStyle}
			plan={plan}
			refusal={refusal}
			rejected={rejected}
		/>
	)
}
