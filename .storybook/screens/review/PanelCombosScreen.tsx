import { Frame, FrameBody } from '../../../src/client/components/Frame'
import { PanelRail, type PanelId } from '../../../src/client/components/PanelRail'
import { cx } from '../../../src/client/lib/cx'

interface Combo {
	open: PanelId[]
	widths: Array<{ Panel: PanelId; flex: number }>
}

const combos: Combo[] = [
	{
		open: ['chat', 'plan'],
		widths: [
			{ Panel: 'chat', flex: 1 },
			{ Panel: 'plan', flex: 1 },
		],
	},
	{
		open: ['plan', 'draft'],
		widths: [
			{ Panel: 'plan', flex: 0.38 },
			{ Panel: 'draft', flex: 1 },
		],
	},
	{
		open: ['draft', 'notes'],
		widths: [
			{ Panel: 'draft', flex: 1 },
			{ Panel: 'notes', flex: 0.26 },
		],
	},
	{
		open: ['chat', 'notes'],
		widths: [
			{ Panel: 'chat', flex: 0.5 },
			{ Panel: 'notes', flex: 0.5 },
		],
	},
	{
		open: ['plan', 'draft', 'notes'],
		widths: [
			{ Panel: 'plan', flex: 0.24 },
			{ Panel: 'draft', flex: 1 },
			{ Panel: 'notes', flex: 0.24 },
		],
	},
]

/**
 * 4(e) — Recap: which Panels can be open at once. Order never changes, Panels
 * never stack, and the two support Panels are always the narrow ones.
 */
export function PanelCombosScreen() {
	return (
		<Frame width={360}>
			<FrameBody className="gap-4 p-4">
				{combos.map((combo, i) => (
					<div key={i} className="flex flex-col gap-2">
						<PanelRail open={combo.open} />
						<div className="flex h-10 overflow-hidden rounded-md border border-edge">
							{combo.widths.map(({ Panel, flex }, j) => (
								<div
									key={Panel}
									style={{ flex }}
									className={cx(
										'grid place-items-center text-10 text-faint',
										j > 0 && 'border-l border-edge',
										Panel === 'draft' ? 'bg-surface' : 'bg-sunk',
									)}
								>
									{Panel}
								</div>
							))}
						</div>
					</div>
				))}
				<p className="text-11 leading-relaxed text-faint">
					Notes is always the narrow one. Plan collapses to a rail when the draft is up.
					Draft alone is the sixth state, and the most common.
				</p>
			</FrameBody>
		</Frame>
	)
}
