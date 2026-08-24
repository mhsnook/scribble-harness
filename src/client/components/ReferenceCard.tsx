import type { ReactNode } from 'react'

import type { Offer } from '../../shared/offer'
import { cx } from '../lib/cx'
import { attribution, referenceName } from '../plan/references'
import { Button } from './Button'
import { Check } from './Check'
import { Chip } from './Chip'
import { CitedLine } from './CitedLine'
import { SourceLink } from './SourceLink'

export interface ReferenceCardProps {
	offer: Offer
	variant?: 'offer' | 'ledger'
	compact?: boolean
	/** Waits on the House, at 1b. */
	favourite?: 'author' | 'publication'
	onAccept?: () => void
	onDecline?: () => void
	onRestore?: () => void
	className?: string
}

function FavouriteMark({ type }: { type: 'author' | 'publication' }) {
	return (
		<span className="inline-flex items-center gap-1 text-accent-ink">
			<span aria-hidden>★</span>
			<span>favourite {type}</span>
		</span>
	)
}

/** One Offer, in the Chat and in the Offer ledger alike. */
export function ReferenceCard({
	offer,
	variant = 'offer',
	compact = false,
	favourite,
	onAccept,
	onDecline,
	onRestore,
	className,
}: ReferenceCardProps) {
	const declined = offer.disposition === 'declined'
	const accepted = offer.disposition === 'accepted'
	const ruled = accepted || declined
	const headingText =
		offer.text === undefined ? referenceName(offer) : offer.source?.title
	const url = offer.source?.url
	// Whether the link goes on the heading or on the line below.
	const headingLinks = url !== undefined && headingText !== undefined
	const cited: ReactNode[] = [
		...(favourite ? [<FavouriteMark key="favourite" type={favourite} />] : []),
		...attribution(offer.source),
		...(url !== undefined && !headingLinks ? [<SourceLink key="url" url={url} />] : []),
	]

	return (
		<article
			className={cx(
				'flex gap-2.5 rounded-lg border border-edge bg-surface p-2.5',
				declined && 'opacity-50',
				className,
			)}
		>
			{variant === 'ledger' && !declined ? (
				// No handler once Accepted, which disables the tick: restoring undoes a
				// Decline and nothing undoes an Accept, so there is no state to go back to.
				<Check
					checked={accepted}
					label={`Accept ${referenceName(offer)}`}
					onChange={accepted ? undefined : onAccept}
				/>
			) : null}
			{variant === 'ledger' && declined ? (
				<span className="label-meta mt-0.5 shrink-0">declined</span>
			) : null}

			<div className="flex min-w-0 flex-1 flex-col gap-1">
				{headingText === undefined ? null : (
					<h4 className="text-13 leading-snug font-semibold text-ink">
						{headingLinks ? (
							<SourceLink url={url}>{headingText}</SourceLink>
						) : (
							headingText
						)}
					</h4>
				)}
				{offer.text === undefined ? null : (
					<blockquote className="border-l-2 border-rule pl-2.5 text-13 leading-relaxed text-ink">
						“{offer.text}”
					</blockquote>
				)}
				<CitedLine className="break-all" parts={cited} />
				{!compact && offer.note !== undefined ? (
					<p className="text-12 leading-relaxed text-muted">{offer.note}</p>
				) : null}
				<div className="mt-0.5 flex flex-wrap items-center gap-1.5">
					{offer.type === 'quote' ? <Chip variant="outline">quote</Chip> : null}
					{variant === 'ledger' && offer.disposition === 'undecided' ? (
						<span className="text-11 text-faint">undecided</span>
					) : null}
				</div>
			</div>

			{variant === 'offer' && !ruled ? (
				<div className="flex shrink-0 flex-col gap-1.5">
					<Button size="sm" onClick={onAccept}>
						accept
					</Button>
					<Button size="sm" variant="quiet" onClick={onDecline}>
						decline
					</Button>
				</div>
			) : null}
			{/* A card in the Chat reports a ruling rather than offering it again.
			    Declining one already Accepted would leave its copy in the Plan, and
			    the Ledger is where a ruling is changed. */}
			{variant === 'offer' && ruled ? (
				<span className="label-meta mt-0.5 shrink-0">{offer.disposition}</span>
			) : null}
			{variant === 'ledger' && declined ? (
				<Button size="sm" variant="link" className="self-start" onClick={onRestore}>
					restore
				</Button>
			) : null}
		</article>
	)
}
