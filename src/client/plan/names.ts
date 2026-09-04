import type { Plan, RefusalSubject } from '../../shared/plan'
import { outlineEntries, sectionLabel } from './outline'
import { referenceEntries, referenceMark, referenceName } from './references'

/**
 * Names one record in the Plan the way the writer would say it, for the places
 * that put a record in a sentence — a Proposal card, a refusal. Sections come
 * out of the same walk the Outline numbers by (`docs/plan.md`), and nothing here reads an id
 * aloud: the writer never saw one.
 */

export type PlanNames = {
	/** "§2 Who actually pays", or "§2" where the Section is untitled. */
	section: (nodeId: string) => string
	/** The Article for a null Scope — `docs/plan.md`. */
	scope: (nodeId: string | null) => string
	/** Its passage or its title, the way the References list has it. */
	reference: (referenceId: string) => string
	/** Whichever of the three a refusal is about. */
	subject: (subject: RefusalSubject | null) => string
	/** The briefest form — "§2", "quote [3]" — for a sentence that goes on to
	 * quote the record and would otherwise print its title twice. */
	label: (subject: RefusalSubject | null) => string
}

export function planNames(plan: Plan): PlanNames {
	// Both forms out of the one walk — `docs/plan.md`.
	const numbered = new Map(
		outlineEntries(plan.outline).map((entry) => {
			const label = sectionLabel(entry)

			return [
				entry.node.id,
				{ label, full: entry.node.title === '' ? label : `${label} ${entry.node.title}` },
			]
		}),
	)

	// Refusals are often about a record that has just gone, so missing is an
	// ordinary answer here rather than a sign of a bug.
	const section = (nodeId: string) =>
		numbered.get(nodeId)?.full ?? 'a Section the Plan does not carry'

	const reference = (referenceId: string) => {
		const held = plan.references.find((entry) => entry.id === referenceId)

		return held === undefined
			? 'a Reference the Plan does not carry'
			: referenceName(held)
	}

	// `describeProposal` never asks for a brief name, so it never pays for this.
	let marked: Map<string, string> | null = null
	const mark = (referenceId: string) => {
		marked ??= new Map(
			referenceEntries(plan).map((entry) => [entry.reference.id, referenceMark(entry)]),
		)

		return marked.get(referenceId) ?? 'that Reference'
	}

	return {
		section,
		reference,
		scope: (nodeId) => (nodeId === null ? 'the Article' : section(nodeId)),
		subject: (subject) => {
			if (subject === null) return 'the Plan'
			if (subject.of === 'article') return 'the Article'

			return subject.of === 'section' ? section(subject.id) : reference(subject.id)
		},
		label: (subject) => {
			if (subject === null) return 'the Plan'
			if (subject.of === 'article') return 'the Article'
			if (subject.of === 'reference') return mark(subject.id)

			return numbered.get(subject.id)?.label ?? 'that Section'
		},
	}
}
