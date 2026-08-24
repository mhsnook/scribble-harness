import { type KeyboardEvent, type ReactNode, useEffect, useState } from 'react'

import { cx } from '../lib/cx'
import { Button } from './Button'
import { GrowingField } from './GrowingField'
import { Markdown } from './Markdown'
import { Notice } from './Notice'

export interface ChatMessageProps {
	from: 'me' | 'guide'
	children: ReactNode
	className?: string
}

/**
 * One turn. Yours is a bounded block; the guide's runs loose against the Panel
 * so the references and controls it returns can sit at full width underneath it.
 */
export function ChatMessage({ from, children, className }: ChatMessageProps) {
	if (from === 'me') {
		return (
			<div
				className={cx(
					'ml-auto max-w-[85%] rounded-lg rounded-br-sm bg-hush px-3 py-2 text-13 leading-relaxed whitespace-pre-wrap text-ink',
					className,
				)}
			>
				{children}
			</div>
		)
	}
	return (
		<div className={cx('max-w-[95%] text-13 leading-relaxed text-ink', className)}>
			{typeof children === 'string' ? <Markdown>{children}</Markdown> : children}
		</div>
	)
}

export interface ChatComposerProps {
	placeholder?: string
	/** Extra controls to the left of send — the ledger toggle, attachments. */
	leading?: ReactNode
	/** Absent on the wireframe screens, which render a still frame. */
	onSend?: (text: string) => void
	/** Why the composer will not send, and null when it will. A Proposal nobody
	 * ruled on is the case worth wording — nothing expires it (§11). */
	blocked?: string | null
	/** A turn is in flight. The field stays open; send becomes stop. */
	busy?: boolean
	/** Cancels the turn. Send stays a send button without one. */
	onStop?: () => void
	className?: string
}

/** A chat message input that grows as you type; Enter adds a new line and
 * control-Enter sends. */
export function ChatComposer({
	placeholder = 'Ask, argue, or paste something in…',
	leading,
	onSend,
	blocked = null,
	busy = false,
	onStop,
	className,
}: ChatComposerProps) {
	const [said, setSaid] = useState('')
	const stopping = busy && onStop !== undefined
	const cannotSend =
		blocked !== null || busy || onSend === undefined || said.trim() === ''

	const send = () => {
		if (cannotSend || onSend === undefined) return

		onSend(said)
		setSaid('')
	}

	const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
		if (event.key !== 'Enter' || !(event.ctrlKey || event.metaKey)) return

		event.preventDefault()
		send()
	}

	return (
		<div data-composer="" className={cx('mt-auto flex flex-col gap-1.5 pt-1', className)}>
			{blocked === null ? null : <Notice>{blocked}</Notice>}
			<div className="flex items-end gap-2">
				{leading}
				<div className="flex flex-1 items-center rounded-md border border-edge bg-surface px-2.5 py-1.5">
					<GrowingField
						disabled={onSend === undefined}
						label="Message the guide"
						onChange={setSaid}
						onKeyDown={onKeyDown}
						placeholder={placeholder}
						value={said}
					/>
				</div>
				{stopping ? (
					<Button onClick={onStop} size="sm">
						stop
					</Button>
				) : (
					<Button disabled={cannotSend} onClick={send} size="sm">
						send
					</Button>
				)}
			</div>
		</div>
	)
}

export interface ChatWorkingProps {
	children: ReactNode
	className?: string
}

/** What the guide is doing. A model can take most of a minute, and a line that
 * never changes reads as a hang, so this counts the seconds it has been up. */
export function ChatWorking({ children, className }: ChatWorkingProps) {
	const [seconds, setSeconds] = useState(0)

	useEffect(() => {
		const tick = setInterval(() => setSeconds((held) => held + 1), 1000)

		return () => clearInterval(tick)
	}, [])

	return (
		<p className={cx('flex items-center gap-1.5 text-11 text-faint', className)}>
			<span aria-hidden className="size-1.5 animate-pulse rounded-full bg-faint" />
			{children}
			{seconds > 0 ? <span className="font-mono">{seconds}s</span> : null}
		</p>
	)
}

export interface ChatRepliesProps {
	children: ReactNode
	className?: string
}

/** The reply chips a guide turn can end with. */
export function ChatReplies({ children, className }: ChatRepliesProps) {
	return <div className={cx('flex flex-wrap gap-1.5', className)}>{children}</div>
}

export interface ChatNoteProps {
	children: ReactNode
	className?: string
}

/** What the Chat did rather than what it said: a Proposal ruled on, a turn
 * looking something up. Quiet, because it is a record and not a turn. */
export function ChatNote({ children, className }: ChatNoteProps) {
	return <p className={cx('text-11 text-faint', className)}>{children}</p>
}
