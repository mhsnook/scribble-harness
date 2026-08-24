import { useEffect, useRef, useState } from 'react'

import { dispositions, type Disposition } from '../../shared/offer'
import { Chip } from '../components/Chip'
import { EmptySlot } from '../components/Field'
import { Notice } from '../components/Notice'
import { PanelHeader } from '../components/Panel'
import { ReferenceCard } from '../components/ReferenceCard'
import { cx } from '../lib/cx'
import type { OfferLedgerHandle } from '../lib/useOfferLedger'

/**
 * A drawer over the Chat Panel's transcript, listing this Article's Offers and
 * letting the writer Accept or Decline each one. The composer stays uncovered,
 * so the control that opened the drawer is the control that closes it.
 *
 * It takes an `OfferLedgerHandle` from its parent: it neither reads nor tracks
 * the Offers itself, it renders the handle's rows and calls the handle's
 * rulings.
 *
 * Closed, it stays mounted and sits translated out of sight — the filter it was
 * on and the rows it had are still there when it comes back.
 */

type Filter = 'all' | Disposition

// The order `offerLedger` keys its counts in.
const filters: Filter[] = ['all', ...dispositions]

export interface OfferLedgerDrawerProps {
	ledger: OfferLedgerHandle
	open: boolean
	/** Escape and `close ×` both route here. */
	onClose: () => void
	className?: string
}

export function OfferLedgerDrawer({
	ledger,
	open,
	onClose,
	className,
}: OfferLedgerDrawerProps) {
	const { ledger: rows, loading, failure, accept, decline, restore } = ledger
	const [filter, setFilter] = useState<Filter>('all')
	const panel = useRef<HTMLDivElement>(null)

	// Focus moves in on open, so Escape has an owner and the writer's next Tab
	// starts inside the drawer rather than back in the transcript behind it.
	//
	// `preventScroll`, because focus lands while the drawer is still translated
	// out of view, and a browser reveals such an element by scrolling the box
	// clipping it — here the transcript.
	useEffect(() => {
		if (open) panel.current?.focus({ preventScroll: true })
	}, [open])

	const shown = filter === 'all' ? rows.offers : rows.byDisposition[filter]

	return (
		<div
			ref={panel}
			aria-label="Offer ledger"
			className={cx(
				'absolute inset-x-0 bottom-0 flex max-h-[85%] flex-col rounded-t-frame border-t border-edge bg-surface shadow-drawer outline-none',
				'transition-transform duration-200 ease-out motion-reduce:transition-none',
				open ? 'translate-y-0' : 'translate-y-full',
				className,
			)}
			// Not modal: the composer below stays live, so the writer can go on
			// typing with the record open.
			inert={!open}
			onKeyDown={(event) => {
				if (event.key === 'Escape') onClose()
			}}
			role="group"
			tabIndex={-1}
		>
			<PanelHeader
				actions={
					<button
						type="button"
						className="text-12 text-faint hover:text-ink"
						onClick={onClose}
					>
						close ×
					</button>
				}
				className="shrink-0 rounded-t-frame border-b border-edge bg-sunk px-3.5 py-2.5"
				meta={`${rows.counts.all} · ${rows.counts.accepted} Accepted`}
				title="Offer ledger"
			/>
			<div className="flex min-h-0 flex-col gap-2.5 overflow-y-auto p-3.5">
				<div className="flex flex-wrap gap-1.5">
					{filters.map((name) => (
						<Chip
							key={name}
							variant={name === filter ? 'solid' : 'outline'}
							interactive
							onClick={() => setFilter(name)}
						>
							{name} · {rows.counts[name]}
						</Chip>
					))}
				</div>
				{failure === null ? null : <Notice>{failure}</Notice>}
				{loading ? <p className="text-12 text-faint">Reading…</p> : null}
				{shown.map((offer) => (
					<ReferenceCard
						key={offer.id}
						offer={offer}
						variant="ledger"
						compact
						onAccept={() => accept(offer)}
						onDecline={() => decline(offer)}
						onRestore={() => restore(offer)}
					/>
				))}
				{!loading && shown.length === 0 ? (
					<EmptySlot>Nothing {filter === 'all' ? 'offered yet' : filter}</EmptySlot>
				) : null}
			</div>
		</div>
	)
}
