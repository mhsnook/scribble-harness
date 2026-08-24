import type { AnchorHTMLAttributes } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remend from 'remend'

import { cx } from '../lib/cx'

export interface MarkdownProps {
	/** The markdown source, whole or mid-stream. */
	children: string
	className?: string
}

/** A citation opens away from the harness, so the writer does not lose the draft
 * they are reading. */
function ExternalLink({
	children,
	href,
	...rest
}: AnchorHTMLAttributes<HTMLAnchorElement>) {
	return (
		<a {...rest} href={href} rel="noreferrer noopener" target="_blank">
			{children}
		</a>
	)
}

const components: Components = { a: ExternalLink }

export function Markdown({ children, className }: MarkdownProps) {
	// `text-only` drops a half-typed link's markup rather than pointing it at a
	// placeholder URL the reader could click.
	const mended = remend(children, { linkMode: 'text-only' })

	return (
		<div className={cx('prose-chat', className)}>
			<ReactMarkdown components={components} remarkPlugins={[remarkGfm]}>
				{mended}
			</ReactMarkdown>
		</div>
	)
}
