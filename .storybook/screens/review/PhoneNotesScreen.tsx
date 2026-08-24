import { Chip } from '../../../src/client/components/Chip'
import { Frame, FrameBody } from '../../../src/client/components/Frame'
import { GuidanceNote } from '../../../src/client/components/GuidanceNote'
import { MetaLabel } from '../../../src/client/components/MetaLabel'
import { draftShort } from '../../mock/content'

/**
 * 4(d) — The phone. A form factor, not a status: read the draft, triage the
 * notes, and nothing else. No writing happens here.
 */
export function PhoneNotesScreen() {
	return (
		<Frame width={280}>
			<div className="flex items-baseline justify-between px-3.5 py-2.5">
				<span className="text-13 text-faint">The Long Tail of Batteries</span>
				<span className="text-11 text-faint">draft 1</span>
			</div>
			<FrameBody className="gap-3.5 px-3.5 pb-4">
				<div className="flex gap-1.5">
					<Chip variant="solid" interactive>
						notes 3
					</Chip>
					<Chip variant="outline" interactive>
						read
					</Chip>
					<Chip variant="outline" interactive>
						plan
					</Chip>
				</div>

				<GuidanceNote
					anchor="§3"
					confidence="confident"
					live
					title="You're restating §2"
					body="§3 is meant to move to the cost of the delay."
					actions={
						<>
							<Chip variant="outline" interactive>
								accept
							</Chip>
							<Chip variant="muted" interactive>
								later
							</Chip>
						</>
					}
				/>
				<GuidanceNote
					anchor="whole piece"
					confidence="tentative"
					title="220 words over target"
				/>

				<div className="flex flex-col gap-1.5">
					<MetaLabel>Read</MetaLabel>
					<div className="prose-draft">
						{draftShort.map((paragraph, i) => (
							<p key={i} className={i > 0 ? 'mt-3 text-13' : 'text-13'}>
								{paragraph}
							</p>
						))}
					</div>
				</div>
			</FrameBody>
		</Frame>
	)
}
