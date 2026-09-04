import { useLiveQuery } from '@tanstack/react-db'
import { useEffect, useState } from 'react'

import {
	fromHouseTone,
	HOUSE_TONE_ID,
	type HouseContext,
	type LexiconEntry,
	nextRuleOrd,
	ordBetween,
	type Skill,
	sortLexicon,
	sortRules,
	sortSkills,
	type StandingRule,
	toHouseTone,
	toLexiconEntry,
	toRule,
	toSkill,
	writerProvenance,
} from '../../shared/house'
import type { ScopeTerms } from '../../shared/plan'
import { failureText } from '../lib/failure'
import { houseSync } from '../lib/houseSync'
import { carryOldSkills } from './carrySkills'

/**
 * The House, live. Reads are live queries over the four collections and writes
 * go straight to them — party-db POSTs the row and the change comes back down
 * the socket, so nothing here holds an optimistic copy.
 *
 * The writer authors every row, which is what makes this different from
 * `useNotes`: the Article Agent's collections are guide-written and ruled on
 * over RPC, and the House has no server-side guard to route around.
 */

export type LexiconDraft = { term: string; definition: string }

export type HouseHandle = {
	house: HouseContext
	skills: readonly Skill[]
	loading: boolean
	/** Why the last write did not land. */
	failure: string | null
	setTone: (tone: ScopeTerms) => void
	addEntry: (draft: LexiconDraft) => void
	editEntry: (id: string, draft: LexiconDraft) => void
	removeEntry: (id: string) => void
	addRule: (body: string) => void
	editRule: (id: string, body: string) => void
	removeRule: (id: string) => void
	/** Moves a rule to the position `to` in the list the writer is reading. */
	moveRule: (id: string, to: number) => void
	saveSkill: (skill: { name: string; prompt: string }) => void
	removeSkill: (name: string) => void
}

export function useHouse(): HouseHandle {
	const sync = houseSync()
	const [failure, setFailure] = useState<string | null>(null)

	const lexiconRows = useLiveQuery(
		(q) => q.from({ lexicon: sync.lexicon }),
		[sync.lexicon],
	)
	const ruleRows = useLiveQuery((q) => q.from({ rule: sync.rule }), [sync.rule])
	const skillRows = useLiveQuery((q) => q.from({ skill: sync.skill }), [sync.skill])
	const toneRows = useLiveQuery((q) => q.from({ tone: sync.tone }), [sync.tone])

	const lexicon = sortLexicon(lexiconRows.data.map(toLexiconEntry))
	const rules = sortRules(ruleRows.data.map(toRule))
	const skills = sortSkills(skillRows.data.map(toSkill))
	const tone = toHouseTone(toneRows.data[0])

	const loading =
		!lexiconRows.isReady || !ruleRows.isReady || !skillRows.isReady || !toneRows.isReady

	// The Skills the writer saved before the House existed. Keyed on the room
	// being open, because the carry writes into it.
	useEffect(() => {
		if (skillRows.isReady) carryOldSkills(sync.skill)
	}, [skillRows.isReady, sync.skill])

	/** A write the row's arrival announces. Only a rejection needs handling, and
	 * it replaces the last one rather than stacking. */
	const write = (
		what: string,
		run: () => { isPersisted: { promise: Promise<unknown> } },
	) => {
		setFailure(null)
		try {
			run().isPersisted.promise.catch((error: unknown) =>
				setFailure(failureText(what, error)),
			)
		} catch (error) {
			setFailure(failureText(what, error))
		}
	}

	const now = () => Date.now()

	return {
		house: { tone, lexicon, rules },
		skills,
		loading,
		failure,

		// The one `tone` row may not exist yet, and party-db has no upsert: an
		// update against a row that is not there comes back as a missing row.
		setTone: (next) =>
			write('The House Tone did not save.', () =>
				toneRows.data.length === 0
					? sync.tone.insert(fromHouseTone(next))
					: sync.tone.update(HOUSE_TONE_ID, (draft) => {
							const row = fromHouseTone(next)
							draft.voice = row.voice
							draft.adjectives = row.adjectives
						}),
			),

		addEntry: (draft) =>
			write('The Lexicon entry did not save.', () =>
				sync.lexicon.insert({
					id: crypto.randomUUID(),
					term: draft.term,
					definition: draft.definition,
					provenance: JSON.stringify(writerProvenance()),
					created_at: now(),
					updated_at: now(),
				}),
			),

		editEntry: (id, draft) =>
			write('The Lexicon entry did not save.', () =>
				sync.lexicon.update(id, (row) => {
					row.term = draft.term
					row.definition = draft.definition
					row.updated_at = now()
				}),
			),

		removeEntry: (id) =>
			write('The Lexicon entry was not deleted.', () => sync.lexicon.delete(id)),

		addRule: (body) =>
			write('The rule did not save.', () =>
				sync.rule.insert({
					id: crypto.randomUUID(),
					ord: nextRuleOrd(rules),
					body,
					created_at: now(),
					updated_at: now(),
				}),
			),

		editRule: (id, body) =>
			write('The rule did not save.', () =>
				sync.rule.update(id, (row) => {
					row.body = body
					row.updated_at = now()
				}),
			),

		removeRule: (id) => write('The rule was not deleted.', () => sync.rule.delete(id)),

		moveRule: (id, to) =>
			write('The rule did not move.', () => {
				// The neighbours are read off the list with the moving rule taken
				// out, so dropping a rule at its own index is a no-op rather than a
				// slot that counts itself.
				const rest = rules.filter((rule) => rule.id !== id)
				const at = Math.max(0, Math.min(to, rest.length))
				const ord = ordBetween(rest[at - 1]?.ord, rest[at]?.ord)

				return sync.rule.update(id, (row) => {
					row.ord = ord
					row.updated_at = now()
				})
			}),

		// Saving under a name that is taken replaces that Skill, because that is
		// what the writer means by saving over one — `docs/reviews.md`.
		saveSkill: (skill) =>
			write('The Skill did not save.', () => {
				const held = skills.find(
					(saved) => saved.name.toLowerCase() === skill.name.toLowerCase(),
				)

				return held === undefined
					? sync.skill.insert({
							id: crypto.randomUUID(),
							name: skill.name,
							prompt: skill.prompt,
							created_at: now(),
							updated_at: now(),
						})
					: sync.skill.update(held.id, (row) => {
							row.name = skill.name
							row.prompt = skill.prompt
							row.updated_at = now()
						})
			}),

		removeSkill: (name) =>
			write('The Skill was not deleted.', () => {
				const held = skills.find((saved) => saved.name === name)
				if (held === undefined) throw new Error(`No Skill is saved as ${name}.`)

				return sync.skill.delete(held.id)
			}),
	}
}

/** The House Tone alone, for a screen that resolves a Scope against it and
 * writes nothing — the Plan Panel and the Section rows under it. */
export function useHouseTone(): ScopeTerms {
	const sync = houseSync()
	const toneRows = useLiveQuery((q) => q.from({ tone: sync.tone }), [sync.tone])

	return toHouseTone(toneRows.data[0])
}

export type { LexiconEntry, StandingRule }
