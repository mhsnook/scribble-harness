import { cx } from '../lib/cx'

/**
 * A row of pills, one or more of them on. Used for the Panel rail in the
 * Article bar and the View rail on the Plan Panel's Outline heading.
 *
 * Renders spans instead of buttons when `onPick` is absent.
 */

export interface RailProps<Item extends string> {
	items: readonly Item[]
	on: readonly Item[]
	/** Omit to render the rail as a static indicator. */
	onPick?: (item: Item) => void
	/** Names the set for a screen reader: "Visible Panels". */
	label: string
	className?: string
}

export function Rail<Item extends string>({
	items,
	on,
	onPick,
	label,
	className,
}: RailProps<Item>) {
	return (
		<div
			aria-label={onPick ? label : undefined}
			className={cx(
				'flex shrink-0 items-center gap-0.5 rounded-full border border-edge bg-sunk p-0.5',
				className,
			)}
			role={onPick ? 'group' : undefined}
		>
			{items.map((item) => {
				const isOn = on.includes(item)
				const Tag = (onPick ? 'button' : 'span') as 'button'

				return (
					<Tag
						key={item}
						{...(onPick
							? {
									type: 'button' as const,
									onClick: () => onPick(item),
									'aria-pressed': isOn,
								}
							: {})}
						className={cx(
							'rounded-full px-2.5 py-1 text-11 leading-none font-medium transition-colors',
							isOn ? 'bg-green text-green-ink' : 'text-faint',
							onPick && !isOn && 'hover:bg-surface hover:text-muted',
						)}
					>
						{item}
					</Tag>
				)
			})}
		</div>
	)
}
