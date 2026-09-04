import { Link } from '@tanstack/react-router'

import type { HouseContext, Skill } from '../../shared/house'
import type { ScopeTerms } from '../../shared/plan'
import { GroupHeading } from '../components/Divider'
import { FrameBody } from '../components/Frame'
import { Notice } from '../components/Notice'
import { BackLink, TitleBar } from '../components/TitleBar'
import { ToneFields } from '../plan/ToneFields'
import { LexiconList } from './LexiconList'
import { SkillList } from './SkillList'
import { StandingRules } from './StandingRules'
import type { LexiconDraft } from './useHouse'

/**
 * The House screen — `docs/house.md`. Takes its actions as props the way
 * `PlanPanel` does, so a story can drive it from local state and the route can
 * drive it from the room.
 */

export interface HouseScreenProps {
	house: HouseContext
	skills: readonly Skill[]
	loading?: boolean
	/** Why the last write did not land. */
	failure?: string | null
	onTone: (tone: ScopeTerms) => void
	onAddEntry: (draft: LexiconDraft) => void
	onEditEntry: (id: string, draft: LexiconDraft) => void
	onRemoveEntry: (id: string) => void
	onAddRule: (body: string) => void
	onEditRule: (id: string, body: string) => void
	onRemoveRule: (id: string) => void
	onMoveRule: (id: string, to: number) => void
	onRemoveSkill: (name: string) => void
}

export function HouseScreen({
	house,
	skills,
	loading = false,
	failure = null,
	onTone,
	onAddEntry,
	onEditEntry,
	onRemoveEntry,
	onAddRule,
	onEditRule,
	onRemoveRule,
	onMoveRule,
	onRemoveSkill,
}: HouseScreenProps) {
	return (
		<>
			<TitleBar
				back={<BackLink to="/">Articles</BackLink>}
				subtitle="· your standing material"
				title="House"
			/>
			<FrameBody className="gap-6 overflow-y-auto p-4">
				{failure === null ? null : <Notice>{failure}</Notice>}
				{loading ? <p className="text-12 text-faint">Opening the House…</p> : null}

				{/* Two columns at the width we design for, one below it. The Tone and
				    the rules are what the guide reads on every turn, so they lead. */}
				<div className="grid gap-6 lg:grid-cols-2">
					<div className="flex flex-col gap-6">
						<HouseTone tone={house.tone} onTone={onTone} />
						<StandingRules
							onAdd={onAddRule}
							onEdit={onEditRule}
							onMove={onMoveRule}
							onRemove={onRemoveRule}
							rules={house.rules}
						/>
					</div>
					<div className="flex flex-col gap-6">
						<LexiconList
							entries={house.lexicon}
							onAdd={onAddEntry}
							onEdit={onEditEntry}
							onRemove={onRemoveEntry}
						/>
						<SkillList onRemove={onRemoveSkill} skills={skills} />
					</div>
				</div>

				<p className="text-12 text-faint">
					Every Article starts from this. An Article or a Section states its own Voice
					over the one here, and its Adjectives on top of these.{' '}
					<Link className="underline decoration-edge underline-offset-[3px]" to="/">
						Back to your Articles
					</Link>
					.
				</p>
			</FrameBody>
		</>
	)
}

interface HouseToneProps {
	tone: ScopeTerms
	onTone: (tone: ScopeTerms) => void
}

/** The House is the outermost Scope, so what it states and what resolves here
 * are the same thing and nothing shows as inherited. */
function HouseTone({ tone, onTone }: HouseToneProps) {
	const voice = tone.voice ?? null
	const adjectives = tone.adjectives ?? []

	return (
		<div className="flex flex-col gap-3">
			<GroupHeading>Tone</GroupHeading>
			<ToneFields
				adjectives={adjectives}
				onAdjectives={(next) => onTone({ ...terms(voice), adjectives: next })}
				onVoice={(next) => onTone({ ...terms(next), adjectives })}
				resolved={{ voice, adjectives }}
				scopeName="the House"
				voice={voice}
			/>
		</div>
	)
}

/** A Scope says "no Voice here" by leaving the field out — `docs/plan.md` on
 * one spelling per state. */
function terms(voice: string | null): ScopeTerms {
	return voice === null ? {} : { voice }
}
