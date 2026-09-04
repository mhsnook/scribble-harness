import type { Plan, Refusal, RefusalReason } from '../../shared/plan'
import { planNames, type PlanNames } from './names'

/**
 * What a refused edit reads as on screen. `refusal.message` is the applier's
 * sentence for the model and names ops and ids (`docs/plan.md`); this is the other reader,
 * a writer mid-task who has seen neither. The table below is the only English
 * in the path — swap it to swap the language — and it is total over
 * `RefusalReason`, so a new refusal site will not compile until it is worded.
 */

type Wording = (refusal: Refusal, name: PlanNames) => string

/** Exported because a Proposal card hits the same condition one step earlier,
 * when the tool call's own payload will not parse. */
export const unreadableText =
	'The Chat sent a change that could not be read. Ask it to try again.'

const wording: Record<RefusalReason, Wording> = {
	unreadable: () => unreadableText,

	noPlan: () => 'The Plan has not arrived yet. Give it a moment.',

	// The four below concern a record the Plan has lost, so there is no name to
	// give it — asking for one prints the fallback and says it twice.
	noSection: () =>
		'That change is for a Section that is no longer in the Outline. Ask the Chat to look again.',

	noParent: () =>
		'That change puts a Section inside one that is no longer in the Outline.',

	noAnchor: (refusal, name) =>
		`That change puts a Section next to one that is no longer in ${name.subject(refusal.other)}.`,

	noReference: () =>
		'That change is for a Reference that is no longer in the list. Ask the Chat to look again.',

	// `label` and not `subject`: this sentence quotes the field, and the fuller
	// name carries the title, so a refused setTitle would print it twice.
	stale: (refusal, name) =>
		`${capitalise(name.label(refusal.subject))} has changed since the Chat proposed this. It now reads ${quote(refusal.found)}, where the change expected ${quote(refusal.expected)}.`,

	// Sections and References share a code: the subject already says which.
	duplicateId: (refusal, name) =>
		`That change adds ${name.subject(refusal.subject)}, which the Plan already carries.`,

	moveUnderOwn: (refusal, name) =>
		`That change moves ${name.subject(refusal.subject)} inside ${name.subject(refusal.other)}, which sits inside it.`,

	mergeUnderOwn: (refusal, name) =>
		`That change merges ${name.subject(refusal.subject)} into ${name.subject(refusal.other)}, which sits inside it.`,

	mergeWithItself: (refusal, name) =>
		`That change merges ${name.subject(refusal.subject)} into itself.`,

	anchorToItself: (refusal, name) =>
		`That change moves ${name.subject(refusal.subject)} next to itself.`,

	wouldNotParse: () =>
		'That change would leave a Plan that cannot be saved, so nothing was written.',
}

export function refusalText(plan: Plan, refusal: Refusal): string {
	return wording[refusal.reason](refusal, planNames(plan))
}

/** A field's value as the writer would read it back — a phrase for an absent
 * one, since `null` is a word they never typed. */
function quote(value: unknown): string {
	if (value === null || value === undefined) return 'nothing'
	if (Array.isArray(value)) {
		return value.length === 0 ? 'nothing' : value.map(String).join(', ')
	}
	if (typeof value === 'string') return value === '' ? 'nothing' : `“${value}”`
	if (typeof value === 'number') return String(value)

	return JSON.stringify(value)
}

function capitalise(text: string): string {
	return text.charAt(0).toUpperCase() + text.slice(1)
}
