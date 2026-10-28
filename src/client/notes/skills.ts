import type { Skill } from '../../shared/house'
import { useHouse } from '../house/useHouse'

/**
 * The Skills, read from the House — `docs/house.md`. A Skill is saved from the
 * Review composer inside an Article and picked from the same place in any
 * other, which is what the House is for.
 */

export type { Skill }

export type SkillsHandle = {
	skills: readonly Skill[]
	save: (skill: { name: string; prompt: string }) => void
	remove: (name: string) => void
}

export function useSkills(): SkillsHandle {
	const house = useHouse()

	return { skills: house.skills, save: house.saveSkill, remove: house.removeSkill }
}
