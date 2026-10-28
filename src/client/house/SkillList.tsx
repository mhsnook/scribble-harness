import type { Skill } from '../../shared/house'
import { Button } from '../components/Button'
import { GroupHeading } from '../components/Divider'
import { EmptySlot } from '../components/Field'

/**
 * The Skills — review prompts the writer saved by name and picks from the
 * Review composer. Saved from inside an Article, and read back here so the
 * writer can drop one they no longer use.
 */

export interface SkillListProps {
	skills: readonly Skill[]
	onRemove: (name: string) => void
}

export function SkillList({ skills, onRemove }: SkillListProps) {
	return (
		<div className="flex flex-col gap-3">
			<GroupHeading count={skills.length}>Skills</GroupHeading>

			{skills.length === 0 ? (
				<EmptySlot>
					No Skills yet. Save a review prompt from an Article and it is here for every
					other one.
				</EmptySlot>
			) : (
				<ul className="flex flex-col gap-2">
					{skills.map((skill) => (
						<li
							className="flex items-start gap-3 border-b border-rule pb-2 last:border-b-0"
							key={skill.id}
						>
							<div className="min-w-0 flex-1">
								<p className="text-13 font-medium text-ink">{skill.name}</p>
								<p className="text-12 text-faint">{skill.prompt}</p>
							</div>
							<Button
								aria-label={`Delete the ${skill.name} Skill`}
								onClick={() => onRemove(skill.name)}
								size="sm"
								variant="quiet"
							>
								delete
							</Button>
						</li>
					))}
				</ul>
			)}
		</div>
	)
}
