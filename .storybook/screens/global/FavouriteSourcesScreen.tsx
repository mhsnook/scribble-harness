import { Chip } from '../../../src/client/components/Chip'
import {
	ExampleBlock,
	PolarityHeading,
} from '../../../src/client/components/ExampleBlock'
import { MetaLabel } from '../../../src/client/components/MetaLabel'
import { RuleBlock, SettingsDetailHeader, SettingsShell } from './SettingsShell'

/**
 * 1(f) — Settings · favourite sources. Publications, authors and thinkers to
 * rank first during research. Ranking, not filtering.
 */
export function FavouriteSourcesScreen() {
	return (
		<SettingsShell
			tab="sources"
			selectedId="field-notes"
			addLabel="+ source"
			items={[
				{ id: 'field-notes', label: 'Field Notes', group: 'Publications · 7' },
				{ id: 'quarterly', label: 'the Quarterly' },
				{ id: 'municipal', label: 'Municipal Review' },
				{ id: 'weill', label: 'A. Weill', group: 'People · 11' },
				{ id: 'okonkwo', label: 'R. Okonkwo' },
				{ id: 'sze', label: 'M. Sze' },
			]}
		>
			<SettingsDetailHeader title="Field Notes" usage="cited in 6 articles" />

			<RuleBlock label="Why we prefer it">
				Reports its own numbers and prints its method. Corrections are dated and visible.
				When it is wrong it is wrong in a way you can check.
			</RuleBlock>

			<div className="grid grid-cols-2 gap-3">
				<div className="flex flex-col gap-2">
					<PolarityHeading polarity="yes">Prefer for</PolarityHeading>
					<div className="flex flex-wrap gap-1.5">
						<Chip variant="outline">policy</Chip>
						<Chip variant="outline">primary data</Chip>
						<Chip variant="outline">interviews</Chip>
					</div>
				</div>
				<div className="flex flex-col gap-2">
					<PolarityHeading polarity="no">Not for</PolarityHeading>
					<ExampleBlock
						polarity="no"
						text="Opinion columns and the weekend essay."
						reason="house view leaks into the reporting"
					/>
				</div>
			</div>

			<div className="flex flex-col gap-2">
				<MetaLabel count="14 times">Pulled in research</MetaLabel>
				<div className="flex items-center gap-2.5">
					<Chip variant="accent">★ rank first</Chip>
					<p className="text-12 text-muted">
						Ahead of equally relevant results, never instead of better ones.
					</p>
				</div>
			</div>
		</SettingsShell>
	)
}
