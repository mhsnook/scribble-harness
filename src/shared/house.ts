import { definePartyCollection } from 'party-db'
import { z } from 'zod'

import {
	adjectiveSchema,
	idSchema,
	type Provenance,
	provenanceSchema,
	type ScopeTerms,
	voiceSchema,
} from './plan'

/**
 * The House — the writer's own standing material, held across every Article:
 * the Lexicon, the standing rules, the Skills, and the House Tone.
 * `docs/house.md` says what it is for, `docs/architecture.md` §2 where it lives.
 *
 * Four party-db collections over D1, spelled the way `src/shared/sync.ts`
 * spells the Article Agent's three: snake_case column names, JSON columns as
 * the text they store, and one pair of mappers per collection.
 *
 * The writer authors every row here, so unlike the Article Agent's collections
 * these take client writes over party-db's own write path.
 */

/** The House is one room, so its name is a constant on both sides of the wire
 * — `docs/architecture.md` §2. */
export const HOUSE_ROOM = 'house'

/** party-db's `oplogRetention`, low so a returning client takes the snapshot
 * path — `docs/sync.md`. The Article Agent's core sets the same number. */
export const HOUSE_OPLOG_RETENTION = 200

/** The `tone` table holds exactly one row, and this is its key. */
export const HOUSE_TONE_ID = 'house'

// ---------------------------------------------------------------------------
// Rows

/** One `lexicon` row as it travels. */
export const lexiconRowSchema = z.object({
	id: idSchema,
	term: z.string(),
	definition: z.string(),
	/** JSON text of a `Provenance`. */
	provenance: z.string(),
	created_at: z.number(),
	updated_at: z.number(),
})
export type LexiconRow = z.infer<typeof lexiconRowSchema>

/** One `rule` row as it travels. `ord` is a fractional index, so moving a rule
 * writes that one row rather than renumbering the list. */
export const ruleRowSchema = z.object({
	id: idSchema,
	ord: z.number(),
	body: z.string(),
	created_at: z.number(),
	updated_at: z.number(),
})
export type RuleRow = z.infer<typeof ruleRowSchema>

/** One `skill` row as it travels. */
export const skillRowSchema = z.object({
	id: idSchema,
	name: z.string(),
	prompt: z.string(),
	created_at: z.number(),
	updated_at: z.number(),
})
export type SkillRow = z.infer<typeof skillRowSchema>

/** The one `tone` row. `voice` says "no Voice here" with null, where a Section
 * says it by leaving the field out — `toHouseTone` maps between the two. */
export const toneRowSchema = z.object({
	id: idSchema,
	voice: z.string().nullable(),
	/** JSON text of `string[]`. */
	adjectives: z.string(),
})
export type ToneRow = z.infer<typeof toneRowSchema>

/** name === channel === table name, on both sides of the wire. */
export const lexiconCollection = definePartyCollection({
	name: 'lexicon',
	key: 'id',
	schema: lexiconRowSchema,
})

export const ruleCollection = definePartyCollection({
	name: 'rule',
	key: 'id',
	schema: ruleRowSchema,
})

export const skillCollection = definePartyCollection({
	name: 'skill',
	key: 'id',
	schema: skillRowSchema,
})

export const toneCollection = definePartyCollection({
	name: 'tone',
	key: 'id',
	schema: toneRowSchema,
})

export const houseCollections = [
	lexiconCollection,
	ruleCollection,
	skillCollection,
	toneCollection,
]

// ---------------------------------------------------------------------------
// The shapes the app reads

/** A named term with the writer's definition of it, injected into the Guide's
 * context whenever the term is invoked. Carries Provenance the way a Reference
 * does — `docs/context.md`. */
export type LexiconEntry = {
	id: string
	term: string
	definition: string
	provenance: Provenance
	createdAt: number
	updatedAt: number
}

/** One standing rule, in the writer's words. */
export type StandingRule = {
	id: string
	ord: number
	body: string
	createdAt: number
	updatedAt: number
}

/** An editorial routine the writer saved by name, picked from the Notes Panel
 * — `docs/reviews.md`. */
export type Skill = {
	id: string
	name: string
	prompt: string
	createdAt: number
	updatedAt: number
}

/** Everything the House puts in front of the Guide. The Skills are absent on
 * purpose: a Skill *is* the writer's prompt, so it reaches a Review by being
 * picked rather than by riding every pack. */
export type HouseContext = {
	tone: ScopeTerms
	lexicon: readonly LexiconEntry[]
	rules: readonly StandingRule[]
}

/** What a House with nothing in it says. */
export const emptyHouse: HouseContext = { tone: {}, lexicon: [], rules: [] }

export function toLexiconEntry(row: LexiconRow): LexiconEntry {
	return {
		id: row.id,
		term: row.term,
		definition: row.definition,
		provenance: JSON.parse(row.provenance) as Provenance,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	}
}

export function fromLexiconEntry(entry: LexiconEntry): LexiconRow {
	return {
		id: entry.id,
		term: entry.term,
		definition: entry.definition,
		provenance: JSON.stringify(entry.provenance),
		created_at: entry.createdAt,
		updated_at: entry.updatedAt,
	}
}

export function toRule(row: RuleRow): StandingRule {
	return {
		id: row.id,
		ord: row.ord,
		body: row.body,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	}
}

export function fromRule(rule: StandingRule): RuleRow {
	return {
		id: rule.id,
		ord: rule.ord,
		body: rule.body,
		created_at: rule.createdAt,
		updated_at: rule.updatedAt,
	}
}

export function toSkill(row: SkillRow): Skill {
	return {
		id: row.id,
		name: row.name,
		prompt: row.prompt,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	}
}

export function fromSkill(skill: Skill): SkillRow {
	return {
		id: skill.id,
		name: skill.name,
		prompt: skill.prompt,
		created_at: skill.createdAt,
		updated_at: skill.updatedAt,
	}
}

/**
 * The House row as the Scope resolver takes it. `resolveScope` reads an absent
 * field as "this Scope states nothing", so a null Voice and an empty Adjective
 * list both have to come back absent — `docs/plan.md` on one spelling per
 * state.
 */
export function toHouseTone(row: ToneRow | undefined): ScopeTerms {
	if (row === undefined) return {}

	const adjectives = JSON.parse(row.adjectives) as string[]

	return {
		...(row.voice === null ? {} : { voice: row.voice }),
		...(adjectives.length === 0 ? {} : { adjectives }),
	}
}

export function fromHouseTone(tone: ScopeTerms): ToneRow {
	return {
		id: HOUSE_TONE_ID,
		voice: tone.voice ?? null,
		adjectives: JSON.stringify(tone.adjectives ?? []),
	}
}

// ---------------------------------------------------------------------------
// Reading the House

/** The schemas both sides parse a written term against, so the House and a
 * Section cannot disagree about what a Voice or an Adjective may be. */
export const houseVoiceSchema = voiceSchema
export const houseAdjectiveSchema = adjectiveSchema

/** The order the writer reads the Lexicon in, and the order it reaches a
 * prompt. Alphabetical by term rather than by when it was written, because a
 * Lexicon is looked things up in. */
export function sortLexicon(entries: readonly LexiconEntry[]): LexiconEntry[] {
	return [...entries].sort((a, b) => a.term.localeCompare(b.term))
}

/** Standing rules in the order the writer put them. */
export function sortRules(rules: readonly StandingRule[]): StandingRule[] {
	return [...rules].sort((a, b) => a.ord - b.ord)
}

export function sortSkills(skills: readonly Skill[]): Skill[] {
	return [...skills].sort((a, b) => a.name.localeCompare(b.name))
}

/** The `ord` a rule appended to this list takes. Fractional indices, so
 * inserting between two rules later needs no renumbering pass. */
export function nextRuleOrd(rules: readonly StandingRule[]): number {
	return rules.reduce((highest, rule) => Math.max(highest, rule.ord), 0) + 1
}

/** The `ord` that puts a rule between two neighbours, either of which may be
 * absent at the ends of the list. */
export function ordBetween(
	before: number | undefined,
	after: number | undefined,
): number {
	if (before === undefined && after === undefined) return 1
	if (before === undefined) return after! - 1
	if (after === undefined) return before + 1

	return (before + after) / 2
}

/**
 * The Lexicon entries in play for a body of text — the ones whose term is
 * invoked in it, per `docs/context.md`.
 *
 * A term matches whole, and case-insensitively: "beat" must not fire on
 * "beaten", and the writer types their term in whichever case the sentence
 * wanted. The boundary is stated as "no letter or digit either side" rather
 * than as `\b`, because a term may end in a character `\b` does not treat as a
 * word character — "C++", "front-end".
 */
export function lexiconInPlay(
	entries: readonly LexiconEntry[],
	texts: readonly string[],
): LexiconEntry[] {
	const text = texts.join('\n')

	return sortLexicon(entries).filter((entry) => invokes(text, entry.term))
}

function invokes(text: string, term: string): boolean {
	const trimmed = term.trim()
	if (trimmed === '') return false

	return new RegExp(
		`(?<![\\p{L}\\p{N}])${escapeTerm(trimmed)}(?![\\p{L}\\p{N}])`,
		'iu',
	).test(text)
}

/** A term is the writer's own text, so it reaches a regex escaped. */
function escapeTerm(term: string): string {
	return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** A new entry, as the writer's own. Nothing builds one from an Offer today,
 * and `provenanceSchema` is what will carry that when something does. */
export function writerProvenance(): Provenance {
	return provenanceSchema.parse({ type: 'writer' })
}
