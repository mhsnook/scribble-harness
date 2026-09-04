import { useState } from 'react'

import type {
	Reference,
	ReferenceContent,
	ReferenceType,
	Source,
} from '../../shared/plan'
import { referenceContentSchema } from '../../shared/plan'
import { Button, ButtonGroup } from '../components/Button'
import { TextField } from '../components/Field'
import { Notice } from '../components/Notice'

/**
 * What a Reference says, in fields the writer types or pastes into.
 *
 * It holds a draft and commits on save, where the rest of the Panel writes
 * every keystroke. A Reference has to carry a text or a source, so a
 * half-filled one is not a Reference yet and the Plan has nowhere to put it.
 */

export interface ReferenceFormProps {
	/** The Reference being rewritten, and nothing when one is being pasted in. */
	reference?: Reference
	onSave: (content: ReferenceContent) => void
	onCancel: () => void
	onDelete?: () => void
}

export function ReferenceForm({
	reference,
	onSave,
	onCancel,
	onDelete,
}: ReferenceFormProps) {
	const [type, setType] = useState<ReferenceType>(reference?.type ?? 'link')
	const [text, setText] = useState(reference?.text ?? '')
	const [note, setNote] = useState(reference?.note ?? '')
	const [source, setSource] = useState<SourceDraft>({
		title: reference?.source?.title ?? '',
		author: reference?.source?.author ?? '',
		publication: reference?.source?.publication ?? '',
		year: reference?.source?.year === undefined ? '' : String(reference.source.year),
		url: reference?.source?.url ?? '',
	})
	const [refused, setRefused] = useState<string | null>(null)

	const field = (key: keyof SourceDraft) => (typed: string) =>
		setSource({ ...source, [key]: typed })

	const save = () => {
		const content = { type, ...stated('text', text), ...stated('note', note) }
		const attribution = sourceOf(source)
		const draft = attribution === null ? content : { ...content, source: attribution }

		// The schema is what says whether this is a Reference yet, so the form
		// asks it rather than keeping a second copy of the rule.
		const parsed = referenceContentSchema.safeParse(draft)
		if (!parsed.success) return setRefused(parsed.error.issues[0].message)

		onSave(parsed.data)
	}

	return (
		<div
			className="flex flex-col gap-2 rounded-md border border-edge bg-surface p-2.5"
			onKeyDown={(event) => {
				if (event.key === 'Escape') onCancel()
			}}
		>
			<ButtonGroup label="What sort of Reference this is">
				<Button onClick={() => setType('link')} pressed={type === 'link'} size="sm">
					link
				</Button>
				<Button onClick={() => setType('quote')} pressed={type === 'quote'} size="sm">
					quote
				</Button>
			</ButtonGroup>

			<div className="flex flex-col gap-1">
				<span className="label-meta text-muted">Passage</span>
				<TextField
					hiddenLabel="The passage"
					onChange={setText}
					placeholder={
						type === 'quote'
							? 'Paste the passage'
							: 'Paste a passage, or leave it and give the source alone'
					}
					rows={3}
					value={text}
				/>
			</div>

			<div className="grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-x-2 gap-y-1.5">
				<span className="label-meta text-muted">Title</span>
				<TextField
					hiddenLabel="Source title"
					onChange={field('title')}
					size="sm"
					value={source.title}
				/>
				<span className="label-meta text-muted">Author</span>
				<TextField
					hiddenLabel="Author"
					onChange={field('author')}
					size="sm"
					value={source.author}
				/>
				<span className="label-meta text-muted">Where</span>
				<TextField
					hiddenLabel="Publication"
					onChange={field('publication')}
					placeholder="publication"
					size="sm"
					value={source.publication}
				/>
				<span className="label-meta text-muted">Year</span>
				<TextField
					hiddenLabel="Year"
					onChange={(typed) => field('year')(typed.replace(/\D/g, ''))}
					size="sm"
					value={source.year}
				/>
				<span className="label-meta text-muted">URL</span>
				<TextField
					hiddenLabel="URL"
					onChange={field('url')}
					placeholder="https://"
					size="sm"
					value={source.url}
				/>
				<span className="label-meta text-muted">Note</span>
				<TextField
					hiddenLabel="Your note"
					onChange={setNote}
					placeholder="why it matters"
					size="sm"
					value={note}
				/>
			</div>

			{refused === null ? null : <Notice>{refused}</Notice>}

			<div className="flex items-center gap-1.5">
				<Button onClick={save} size="sm">
					{reference === undefined ? 'add' : 'save'}
				</Button>
				<Button onClick={onCancel} size="sm" variant="quiet">
					cancel
				</Button>
				{onDelete ? (
					<Button className="ml-auto" onClick={onDelete} size="sm" variant="quiet">
						delete
					</Button>
				) : null}
			</div>
		</div>
	)
}

type SourceDraft = Record<'title' | 'author' | 'publication' | 'year' | 'url', string>

/** A field the writer left empty is a field the Reference does not carry — `docs/plan.md`'s
 * one spelling per state. */
function stated(key: 'text' | 'note', value: string) {
	return value.trim() === '' ? {} : { [key]: value.trim() }
}

/** The attribution, or null where the writer stated none of it. */
function sourceOf(draft: SourceDraft): Source | null {
	const source: Source = {}
	if (draft.title.trim() !== '') source.title = draft.title.trim()
	if (draft.author.trim() !== '') source.author = draft.author.trim()
	if (draft.publication.trim() !== '') source.publication = draft.publication.trim()
	if (draft.year !== '') source.year = Number(draft.year)
	if (draft.url.trim() !== '') source.url = draft.url.trim()

	return Object.keys(source).length === 0 ? null : source
}
