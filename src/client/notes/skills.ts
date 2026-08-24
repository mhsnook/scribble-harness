import { useCallback, useState } from 'react'

/**
 * Saved review prompts — context.md's **Skill**, at the smallest size that is
 * useful. House material; until the House lands at 1b they live in
 * `localStorage`, so a Skill saved on one machine is not on the other —
 * `docs/reviews.md` §Skills.
 */

export type Skill = {
	/** What the picker shows, and what identifies it. */
	name: string
	prompt: string
}

const KEY = 'scribble.review-skills'

/** Storage throws in a few real places — a locked-down browser, a sandboxed
 * frame — and none of them is worth losing the Panel over. A Skill is a
 * convenience, so failing to read one leaves the writer typing their prompt. */
export function loadSkills(): Skill[] {
	try {
		const held: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? '[]')
		if (!Array.isArray(held)) return []

		return held.filter(isSkill)
	} catch {
		return []
	}
}

function isSkill(value: unknown): value is Skill {
	const skill = value as { name?: unknown; prompt?: unknown }

	return typeof skill?.name === 'string' && typeof skill?.prompt === 'string'
}

function writeSkills(skills: Skill[]): Skill[] {
	try {
		window.localStorage.setItem(KEY, JSON.stringify(skills))
	} catch {
		// Kept in memory for this session, which is the whole of what is lost.
	}

	return skills
}

/** Saving under a name that is taken replaces it, because that is what the
 * writer means by saving over one. */
export function withSkill(skills: readonly Skill[], skill: Skill): Skill[] {
	const rest = skills.filter((held) => held.name !== skill.name)

	return [...rest, skill].sort((a, b) => a.name.localeCompare(b.name))
}

export type SkillsHandle = {
	skills: readonly Skill[]
	save: (skill: Skill) => void
	remove: (name: string) => void
}

export function useSkills(): SkillsHandle {
	const [skills, setSkills] = useState<Skill[]>(loadSkills)

	const save = useCallback((skill: Skill) => {
		setSkills((held) => writeSkills(withSkill(held, skill)))
	}, [])

	const remove = useCallback((name: string) => {
		setSkills((held) => writeSkills(held.filter((skill) => skill.name !== name)))
	}, [])

	return { skills, save, remove }
}
