import type { ChangeEvent, KeyboardEvent, ReactNode, Ref } from 'react'

import { cx } from '../lib/cx'

/** The frame both the read-only Field and the editable TextField sit in, so a
 * field the writer types in looks like the one they cannot.
 *
 * `min-w-0` is load-bearing: an input carries an intrinsic width of about 20
 * characters, and a flex item's automatic minimum size takes it: the frame
 * would refuse to shrink inside a narrow field and spill over whatever sits
 * beside it. */
const frameClass =
	'flex min-w-0 flex-1 items-center gap-2 rounded-md border border-edge bg-surface px-2.5'

const sizeClass = {
	sm: 'h-7 text-12',
	md: 'h-8 text-13',
}

/** One label style for every field, and it is the same mono label a list gets.
 * `text-muted` over the class's own faint, because a label the writer is
 * reading to fill a field in is not a count they skim past. */
const labelClass = 'label-meta shrink-0 text-muted'

export interface FieldProps {
	label?: ReactNode
	value?: ReactNode
	placeholder?: string
	/** Right-hand adornment: a unit, a chip, a score. */
	suffix?: ReactNode
	size?: 'sm' | 'md'
	className?: string
}

/** A field that displays a value. `TextField` is the one the writer types in. */
export function Field({
	label,
	value,
	placeholder,
	suffix,
	size = 'md',
	className,
}: FieldProps) {
	const empty = value === undefined || value === null || value === ''
	return (
		<div className={cx('flex items-center gap-2.5', className)}>
			{label ? <span className={labelClass}>{label}</span> : null}
			<div className={cx(frameClass, sizeClass[size])}>
				<span
					className={cx('min-w-0 flex-1 truncate', empty ? 'text-faint' : 'text-ink')}
				>
					{empty ? placeholder : value}
				</span>
				{suffix}
			</div>
		</div>
	)
}

export interface TextFieldProps {
	/** Shown beside the field, and clicking it focuses the field. Where a row of
	 * fields carries no visible label, pass `hiddenLabel` instead. */
	label?: ReactNode
	/** Names the field for a screen reader when no label is shown. */
	hiddenLabel?: string
	value: string
	onChange: (value: string) => void
	/** Where Enter means something — closing the Section being edited, say. */
	onKeyDown?: (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void
	placeholder?: string
	suffix?: ReactNode
	size?: 'sm' | 'md'
	/** More than one row renders a textarea, which is what an intent note wants. */
	rows?: number
	className?: string
}

/** The same frame, with the writer typing into it. */
export function TextField({
	label,
	hiddenLabel,
	value,
	onChange,
	onKeyDown,
	placeholder,
	suffix,
	size = 'md',
	rows = 1,
	className,
}: TextFieldProps) {
	const handle = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
		onChange(event.target.value)

	const inputClass =
		'min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-faint'

	return (
		<label
			className={cx('flex gap-2.5', rows > 1 ? 'items-start' : 'items-center', className)}
		>
			{label ? (
				<span className={cx(labelClass, rows > 1 && 'pt-1.5')}>{label}</span>
			) : null}
			<div className={cx(frameClass, rows > 1 ? 'py-1.5 text-12' : sizeClass[size])}>
				{rows > 1 ? (
					<textarea
						aria-label={hiddenLabel}
						className={cx(inputClass, 'resize-none leading-snug')}
						onChange={handle}
						onKeyDown={onKeyDown}
						placeholder={placeholder}
						rows={rows}
						value={value}
					/>
				) : (
					<input
						aria-label={hiddenLabel}
						className={inputClass}
						onChange={handle}
						onKeyDown={onKeyDown}
						placeholder={placeholder}
						type="text"
						value={value}
					/>
				)}
				{suffix}
			</div>
		</label>
	)
}

export interface InlineInputProps {
	/** Names the field for a screen reader. A row of these carries no visible
	 * label, so it is required rather than optional. */
	label: string
	value: string
	onChange: (value: string) => void
	onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void
	placeholder?: string
	/** Held so a Section the writer has just made can take the caret. */
	ref?: Ref<HTMLInputElement>
	className?: string
}

/**
 * A field with no frame around it, for text that is already the thing on the
 * row — a Section title, an Adjective being added. It shows its edge on hover
 * and on focus, so a row of them reads as text until the writer reaches for it.
 */
export function InlineInput({
	label,
	value,
	onChange,
	onKeyDown,
	placeholder,
	ref,
	className,
}: InlineInputProps) {
	return (
		<input
			aria-label={label}
			ref={ref}
			className={cx(
				'min-w-0 rounded-sm border-b border-transparent bg-transparent text-ink outline-none placeholder:text-faint hover:border-edge focus:border-edge',
				className,
			)}
			onChange={(event) => onChange(event.target.value)}
			onKeyDown={onKeyDown}
			placeholder={placeholder}
			type="text"
			value={value}
		/>
	)
}

export interface EmptySlotProps {
	children: ReactNode
	className?: string
}

/**
 * A dashed placeholder. In this design dashed always means "optional, and not
 * filled in yet" — it is never a disabled state.
 */
export function EmptySlot({ children, className }: EmptySlotProps) {
	return (
		<div
			className={cx(
				'flex items-center justify-center rounded-md border border-dashed border-edge px-3 py-2.5 text-center text-12 text-faint',
				className,
			)}
		>
			{children}
		</div>
	)
}

export interface FieldRowProps {
	label: ReactNode
	children: ReactNode
	className?: string
}

/**
 * A row with the label in a fixed left gutter and the children to the right of
 * it. Used for Voice, Adjectives, and the References line.
 *
 * The gutter is a fixed width, so separate FieldRows line up without sharing a
 * grid. Children that wrap grow downwards; the label stays at the top.
 */
export function FieldRow({ label, children, className }: FieldRowProps) {
	return (
		<div
			className={cx('grid grid-cols-[5rem_minmax(0,1fr)] items-start gap-x-2', className)}
		>
			<span className="label-meta pt-1 text-muted">{label}</span>
			<div className="min-w-0">{children}</div>
		</div>
	)
}
