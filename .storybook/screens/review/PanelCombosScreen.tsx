import { panelShare } from '../../../src/client/article/usePanels'
import { Frame, FrameBody } from '../../../src/client/components/Frame'
import { PanelRail, type PanelId } from '../../../src/client/components/PanelRail'
import { cx } from '../../../src/client/lib/cx'

const combos: PanelId[][] = [
	['chat', 'plan'],
	['plan', 'draft'],
	['draft', 'notes'],
	['chat', 'notes'],
	['plan', 'draft', 'notes'],
]

/**
 * 4(e) — Recap: which Panels can be open at once. Order never changes, Panels
 * never stack, and the Draft is always the wide one.
 *
 * Each bar is drawn by `panelShare` rather than by a ratio typed in here, so a
 * change to the widths cannot leave this recap showing the old ones.
 */
export function PanelCombosScreen() {
	return (
		<Frame width={360}>
			<FrameBody className="gap-4 p-4">
				{combos.map((open, i) => (
					<div key={i} className="flex flex-col gap-2">
						<PanelRail open={open} />
						<div className="flex h-10 overflow-hidden rounded-md border border-edge">
							{open.map((panel, j) => (
								<div
									key={panel}
									style={{ flex: panelShare(open, panel) }}
									className={cx(
										'grid place-items-center text-10 text-faint',
										j > 0 && 'border-l border-edge',
										panel === 'draft' ? 'bg-surface' : 'bg-sunk',
									)}
								>
									{panel}
								</div>
							))}
						</div>
					</div>
				))}
				<p className="text-11 leading-relaxed text-faint">
					The Draft takes twice what a supporting Panel does. Plan collapses to a rail
					when the draft is up. Draft alone is the sixth state, and the most common.
				</p>
			</FrameBody>
		</Frame>
	)
}
