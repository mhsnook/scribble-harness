import type { Allocation } from '../../shared/plan'
import type { TextFieldProps } from '../components/Field'
import { TextField } from '../components/Field'

/**
 * The word-count target on screen. The total is stored and nothing derives it,
 * so the parts are allowed to disagree with the whole and the gap is
 * information rather than an error — docs/architecture.md §4.
 */

export interface TargetFieldProps {
	label?: string
	hiddenLabel?: string
	onKeyDown?: TextFieldProps['onKeyDown']
	/** The stored target, and null where none is stated. */
	target: number | null
	onTarget: (target: number | null) => void
	placeholder?: string
	size?: 'sm' | 'md'
	className?: string
}

export function TargetField({
	label,
	hiddenLabel,
	onKeyDown,
	target,
	onTarget,
	placeholder = 'no target',
	size = 'sm',
	className,
}: TargetFieldProps) {
	// Only digits reach the Plan. A target is a positive whole number of words,
	// so an empty field and a zero both say "no target" rather than one of them
	// failing the schema on the way out.
	const read = (typed: string) => {
		const digits = typed.replace(/\D/g, '')
		onTarget(digits === '' || Number(digits) === 0 ? null : Number(digits))
	}

	return (
		<TextField
			className={className}
			hiddenLabel={hiddenLabel}
			label={label}
			onChange={read}
			onKeyDown={onKeyDown}
			placeholder={placeholder}
			size={size}
			suffix={<span className="shrink-0 text-11 text-faint">words</span>}
			value={target === null ? '' : String(target)}
		/>
	)
}

export interface AllocationNoteProps {
	allocation: Allocation
	/** What the parts are called here: Sections under the Article, Subsections
	 * under a Section. */
	parts?: string
	className?: string
}

/** What the targets below add up to against the target above them. */
export function AllocationNote({
	allocation,
	parts = 'Sections',
	className,
}: AllocationNoteProps) {
	const { gap, status, placed } = allocation
	if (status === 'unstated') return null

	const words = (count: number) => `${count.toLocaleString()} words`

	const said = {
		balanced: `fully allocated across ${placed}/${allocation.parts} ${parts}`,
		unallocated: `${words(gap ?? 0)} unallocated`,
		under: `the ${parts} fall ${words(gap ?? 0)} short`,
		over: `${words(-(gap ?? 0))} over the total`,
	}[status]

	return <span className={className}>{said}</span>
}
