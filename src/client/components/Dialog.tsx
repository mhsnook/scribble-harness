import { type ReactNode, useEffect, useRef } from 'react'

import { cx } from '../lib/cx'

export interface DialogProps {
	open: boolean
	/** Escape, the backdrop, and anything the caller wires to it. */
	onClose: () => void
	title: string
	/** Under the title, quiet. */
	subtitle?: ReactNode
	children?: ReactNode
	/** The row of buttons at the foot. */
	actions?: ReactNode
	className?: string
}

/**
 * A small panel over the whole window. Native `<dialog>` rather than a fixed
 * div, because `showModal` gives the focus trap, the inert page, and Escape.
 */
export function Dialog({
	open,
	onClose,
	title,
	subtitle,
	children,
	actions,
	className,
}: DialogProps) {
	const held = useRef<HTMLDialogElement>(null)

	useEffect(() => {
		const dialog = held.current
		if (dialog === null) return

		if (open && !dialog.open) dialog.showModal()
		if (!open && dialog.open) dialog.close()
	}, [open])

	return (
		<dialog
			className={cx(
				'm-auto w-[min(24rem,calc(100vw-2rem))] rounded-frame border border-edge bg-surface p-0 text-ink shadow-frame backdrop:bg-ink/25',
				className,
			)}
			// Every close routes here, Escape included, so the caller's state cannot
			// drift from what is on screen.
			onClose={onClose}
			onClick={(event) => {
				// The dialog element itself is the backdrop; its content is inside.
				if (event.target === held.current) onClose()
			}}
			ref={held}
		>
			<div className="flex flex-col gap-3.5 p-4">
				<div className="flex flex-col gap-1">
					<h2 className="text-15 leading-tight font-medium text-ink">{title}</h2>
					{subtitle ? (
						<p className="text-12 leading-relaxed text-faint">{subtitle}</p>
					) : null}
				</div>
				{children}
				{actions ? <div className="flex justify-end gap-2">{actions}</div> : null}
			</div>
		</dialog>
	)
}
