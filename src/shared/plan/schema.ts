import { z } from 'zod'

/**
 * The Plan's schema, parsed whole on every write. The data model it enforces is
 * `docs/plan.md`, who may write it is `docs/architecture.md` §3, and the reasoning behind
 * both is docs/adr/0002-the-plan-data-model.md.
 */

// `.min(1)` throughout, so that a field carries one spelling of "nothing here"
// rather than two — `docs/plan.md`. A title is the exception below and carries no floor: it
// is empty from the moment a node is made until the writer types into it.
export const idSchema = z.string().min(1)
export const voiceSchema = z.string().min(1)
export const adjectiveSchema = z.string().min(1)
export const intentSchema = z.string().min(1)
export const targetSchema = z.number().int().positive()

/** Which type of Reference this is: a Link or a Quote. Stored on the record
 * rather than derived from whether a text is present, so an Offer and the
 * Reference it was copied into carry one answer and the two Panels cannot
 * label it differently. */
export const referenceTypeSchema = z.enum(['link', 'quote'])
export type ReferenceType = z.infer<typeof referenceTypeSchema>

// strictObject throughout: the Plan has one writer, so an unknown key is a bug
// rather than a forward-compatible extension — §3, rule 1.

/** The attribution inside a Reference. */
export const sourceSchema = z
	.strictObject({
		title: z.string().min(1).optional(),
		author: z.string().min(1).optional(),
		publication: z.string().min(1).optional(),
		year: z.number().int().optional(),
		url: z.url().optional(),
	})
	.refine((source) => Object.values(source).some((field) => field !== undefined), {
		error: 'A source carries at least one of title, author, publication, year, or url.',
	})

/** Where a record came from. */
export const provenanceSchema = z
	.strictObject({
		type: z.enum(['writer', 'offer']),
		offerId: idSchema.optional(),
	})
	.refine(
		(provenance) => (provenance.type === 'offer') === (provenance.offerId !== undefined),
		{
			error: 'Provenance of type offer names an offerId, and type writer names none.',
		},
	)

/** What a Reference says, against the three fields that identify it, say where
 * it came from, and place it. An op that edits one replaces this much and
 * leaves those alone. */
const referenceContentFields = {
	type: referenceTypeSchema,
	text: z.string().min(1).optional(),
	source: sourceSchema.optional(),
	note: z.string().min(1).optional(),
}

type ReferenceContentFields = { type: ReferenceType; text?: string }

const carriesSomething = {
	check: (reference: { text?: string; source?: unknown }) =>
		reference.text !== undefined || reference.source !== undefined,
	error: 'A Reference carries a text, a source, or both. One with neither is nothing.',
}

const quoteCarriesText = {
	check: (reference: ReferenceContentFields) =>
		reference.type !== 'quote' || reference.text !== undefined,
	error: 'A Reference of type quote carries a text.',
}

export const referenceContentSchema = z
	.strictObject(referenceContentFields)
	.refine(carriesSomething.check, { error: carriesSomething.error })
	.refine(quoteCarriesText.check, { error: quoteCarriesText.error })

/** Something the writer is drawing on. */
export const referenceSchema = z
	.strictObject({
		id: idSchema,
		provenance: provenanceSchema,
		nodeId: idSchema.nullable(),
		...referenceContentFields,
	})
	.refine(carriesSomething.check, { error: carriesSomething.error })
	.refine(quoteCarriesText.check, { error: quoteCarriesText.error })

/** The unit of structure in the Plan. */
export const outlineNodeSchema = z.strictObject({
	id: idSchema,
	title: z.string(),
	intent: intentSchema.optional(),
	target: targetSchema.optional(),
	voice: voiceSchema.optional(),
	adjectives: z.array(adjectiveSchema).min(1).optional(),
	// zod 4 recursive schema
	get children() {
		return z.array(outlineNodeSchema)
	},
})

// The id checks below take a Plan, so the object schema is named separately —
// inferring the type from the refined schema would be circular.
const planObjectSchema = z.strictObject({
	title: z.string(),
	totalTarget: targetSchema.nullable(),
	voice: voiceSchema.optional(),
	adjectives: z.array(adjectiveSchema),
	outline: z.array(outlineNodeSchema),
	references: z.array(referenceSchema),
})

export type Source = z.infer<typeof sourceSchema>
export type Provenance = z.infer<typeof provenanceSchema>
export type ReferenceContent = z.infer<typeof referenceContentSchema>
export type Reference = z.infer<typeof referenceSchema>
export type OutlineNode = z.infer<typeof outlineNodeSchema>
export type Plan = z.infer<typeof planObjectSchema>

export const planSchema = planObjectSchema.superRefine(checkIds)

/** What a Reference says, without the three fields `setReference` leaves
 * alone. Both the builder of that op and the applier read it here, so the two
 * sides of an `expected` cannot disagree about what content is. */
export function referenceContent(reference: Reference): ReferenceContent {
	const { type, text, source, note } = reference

	return { type, ...(text && { text }), ...(source && { source }), ...(note && { note }) }
}

/** What a new Article opens into, shaped so `validateStateChange` accepts it. */
export function emptyPlan(title = ''): Plan {
	return {
		title,
		totalTarget: null,
		adjectives: [],
		outline: [],
		references: [],
	}
}

type Path = (string | number)[]

/** Uniqueness and referential integrity, which the object shape cannot state. */
function checkIds(plan: Plan, ctx: z.RefinementCtx) {
	const claim = (seen: Set<string>, id: string, path: Path, noun: string) => {
		if (seen.has(id)) {
			ctx.addIssue({ code: 'custom', path, message: `Two ${noun} carry the id ${id}.` })
		}
		seen.add(id)
	}

	const nodeIds = new Set<string>()

	const walk = (nodes: OutlineNode[], path: Path) => {
		nodes.forEach((node, index) => {
			const nodePath = [...path, index]
			claim(nodeIds, node.id, [...nodePath, 'id'], 'Sections')
			walk(node.children, [...nodePath, 'children'])
		})
	}
	walk(plan.outline, ['outline'])

	const referenceIds = new Set<string>()
	const offerIds = new Set<string>()

	plan.references.forEach((reference, index) => {
		claim(referenceIds, reference.id, ['references', index, 'id'], 'References')

		// One Offer becomes one Reference — `docs/chat.md`.
		const { offerId } = reference.provenance
		if (offerId !== undefined) {
			if (offerIds.has(offerId)) {
				ctx.addIssue({
					code: 'custom',
					path: ['references', index, 'provenance', 'offerId'],
					message: `Two References were copied from the Offer ${offerId}.`,
				})
			}
			offerIds.add(offerId)
		}

		if (reference.nodeId !== null && !nodeIds.has(reference.nodeId)) {
			ctx.addIssue({
				code: 'custom',
				path: ['references', index, 'nodeId'],
				message: `Reference ${reference.id} is placed at ${reference.nodeId}, which no Section carries.`,
			})
		}
	})
}
