import type { Collection } from '@tanstack/db'

import { fromSkill, type SkillRow } from '../../shared/house'

/**
 * The Skills that were saved before the House arrived.
 *
 * They lived in `localStorage`, so a Skill saved on one machine was not on the
 * other — `docs/reviews.md` said so while that was true. `useHouse` runs this
 * once the room is open, and the key is gone afterwards.
 */

const KEY = 'scribble.review-skills'

export function carryOldSkills(skills: Collection<SkillRow>): void {
	const held = readOldSkills()
	if (held.length === 0) return

	// Cleared before the writes go out rather than after: a second call
	// mid-flight would write the same names twice.
	forgetOldSkills()

	const now = Date.now()
	for (const skill of held) {
		skills.insert(
			fromSkill({ id: crypto.randomUUID(), ...skill, createdAt: now, updatedAt: now }),
		)
	}
}

/** Storage throws in a few real places — a locked-down browser, a sandboxed
 * frame — and none of them is worth losing the House over. */
function readOldSkills(): { name: string; prompt: string }[] {
	try {
		const held: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? '[]')
		if (!Array.isArray(held)) return []

		return held.filter(isOldSkill)
	} catch {
		return []
	}
}

function forgetOldSkills(): void {
	try {
		window.localStorage.removeItem(KEY)
	} catch {
		// The room has the Skills now. A second carry writes the same names, and
		// the unique index on `name` is what refuses the duplicate.
	}
}

function isOldSkill(value: unknown): value is { name: string; prompt: string } {
	const skill = value as { name?: unknown; prompt?: unknown }

	return typeof skill?.name === 'string' && typeof skill?.prompt === 'string'
}
