import { Frame, FrameBody } from '../../../src/client/components/Frame'
import { MetaLabel } from '../../../src/client/components/MetaLabel'
import { cx } from '../../../src/client/lib/cx'
import { useOfferLedger } from '../../../src/client/lib/useOfferLedger'
import { referenceName } from '../../../src/client/plan/references'
import type { Disposition } from '../../../src/shared/offer'

/**
 * 2(g) — The Offer ledger opened from the composer. The groups are the three
 * rulings and their order is fixed, so the Undecided pile visibly shrinks as
 * you work.
 *
 * It reads no Plan. Once the writer Accepts, where the Reference goes and which
 * Section it lands at are the Plan Panel's to show.
 */
export function LedgerPopoverScreen() {
	const { ledger } = useOfferLedger()

	const groups: { label: string; disposition: Disposition }[] = [
		{ label: 'Accepted', disposition: 'accepted' },
		{ label: 'Undecided', disposition: 'undecided' },
		{ label: 'Declined', disposition: 'declined' },
	]

	return (
		<Frame width={340}>
			<div className="flex items-center gap-2.5 border-b border-edge bg-sunk px-3.5 py-2.5">
				<h3 className="text-14 font-semibold text-ink">Offer ledger</h3>
				<span className="text-12 text-faint">{ledger.counts.all}</span>
				<button type="button" className="ml-auto text-12 text-faint hover:text-ink">
					⌄
				</button>
			</div>
			<FrameBody className="gap-4 p-3.5">
				{groups
					.filter((group) => ledger.counts[group.disposition] > 0)
					.map((group) => (
						<section
							key={group.label}
							className={cx(
								'flex flex-col gap-1.5',
								group.disposition === 'declined' && 'opacity-50',
							)}
						>
							<MetaLabel count={ledger.counts[group.disposition]}>
								{group.label}
							</MetaLabel>
							{ledger.byDisposition[group.disposition].map((offer) => (
								<p key={offer.id} className="min-w-0 truncate text-12 text-muted">
									{referenceName(offer)}
								</p>
							))}
						</section>
					))}
			</FrameBody>
		</Frame>
	)
}
