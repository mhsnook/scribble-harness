import { useState } from 'react'

import { type Favourite, type FavouriteType, favouriteTypes } from '../../shared/house'
import { Button, ButtonGroup } from '../components/Button'
import { GroupHeading } from '../components/Divider'
import { EmptySlot, FieldRow, TextField } from '../components/Field'
import { MetaLabel } from '../components/MetaLabel'
import { TermChips } from '../components/TermChips'
import type { FavouriteDraft } from './useHouse'

/**
 * The favourites — publications, people, and ideas research ranks first. A
 * favourite goes ahead of results of equal merit and never ahead of better
 * ones, so the list says what to prefer rather than what to search.
 */

export interface FavouriteListProps {
	favourites: readonly Favourite[]
	onAdd: (draft: FavouriteDraft) => void
	onEdit: (id: string, draft: FavouriteDraft) => void
	onRemove: (id: string) => void
}

const groupName: Record<FavouriteType, string> = {
	publication: 'Publications',
	person: 'People',
	idea: 'Ideas',
}

const typeName: Record<FavouriteType, string> = {
	publication: 'Publication',
	person: 'Person',
	idea: 'Idea',
}

const namePlaceholder: Record<FavouriteType, string> = {
	publication: 'Field Notes',
	person: 'A. Weill',
	idea: 'degrowth',
}

const whyPlaceholder: Record<FavouriteType, string> = {
	publication: 'Reports its own numbers and prints its method.',
	person: 'Goes to the primary sources, and says when they are thin.',
	idea: 'What you mean by it, and why research should lean toward it.',
}

export function FavouriteList({
	favourites,
	onAdd,
	onEdit,
	onRemove,
}: FavouriteListProps) {
	/** The one favourite open for editing. The rest are a line each, so the list
	 * stays readable at the length a working writer's list reaches. */
	const [open, setOpen] = useState<string | null>(null)
	const [type, setType] = useState<FavouriteType>('publication')
	const [name, setName] = useState('')
	const [why, setWhy] = useState('')

	const ready = name.trim() !== ''

	const add = () => {
		if (!ready) return

		onAdd({ type, name, why, preferFor: [], notFor: '' })
		setName('')
		setWhy('')
	}

	return (
		<div className="flex flex-col gap-3">
			<GroupHeading count={favourites.length}>Favourites</GroupHeading>

			{favourites.length === 0 ? (
				<EmptySlot>
					No favourites yet. Research puts a favourite ahead of equally good results,
					never ahead of better ones.
				</EmptySlot>
			) : (
				favouriteTypes.map((group) => {
					const held = favourites.filter((favourite) => favourite.type === group)
					if (held.length === 0) return null

					return (
						<section className="flex flex-col gap-2" key={group}>
							<MetaLabel className="text-muted" count={held.length}>
								{groupName[group]}
							</MetaLabel>
							<ul className="flex flex-col">
								{held.map((favourite) =>
									open === favourite.id ? (
										<FavouriteRow
											favourite={favourite}
											key={favourite.id}
											onClose={() => setOpen(null)}
											onEdit={(draft) => onEdit(favourite.id, draft)}
											onRemove={() => onRemove(favourite.id)}
										/>
									) : (
										<FavouriteLine
											favourite={favourite}
											key={favourite.id}
											onOpen={() => setOpen(favourite.id)}
										/>
									),
								)}
							</ul>
						</section>
					)
				})
			)}

			<div className="flex flex-col gap-1.5 rounded-md border border-dashed border-edge p-2.5">
				<ButtonGroup label="What the new favourite is">
					{favouriteTypes.map((option) => (
						<Button
							key={option}
							onClick={() => setType(option)}
							pressed={type === option}
							size="sm"
						>
							{typeName[option]}
						</Button>
					))}
				</ButtonGroup>
				<FieldRow label="Name">
					<TextField
						hiddenLabel={`New favourite ${typeName[type].toLowerCase()}`}
						onChange={setName}
						onKeyDown={(event) => {
							if (event.key !== 'Enter') return
							event.preventDefault()
							add()
						}}
						placeholder={namePlaceholder[type]}
						size="sm"
						value={name}
					/>
				</FieldRow>
				<FieldRow label="Why">
					<TextField
						hiddenLabel="Why you prefer the new favourite"
						onChange={setWhy}
						placeholder={whyPlaceholder[type]}
						rows={2}
						value={why}
					/>
				</FieldRow>
				<div className="flex justify-end">
					<Button disabled={!ready} onClick={add} size="sm">
						+ add favourite
					</Button>
				</div>
			</div>
		</div>
	)
}

interface FavouriteLineProps {
	favourite: Favourite
	onOpen: () => void
}

/** A closed favourite: its name, then why, cut to the line. */
function FavouriteLine({ favourite, onOpen }: FavouriteLineProps) {
	return (
		<li className="border-b border-rule last:border-b-0">
			<button
				aria-expanded={false}
				className="flex w-full min-w-0 items-baseline gap-2.5 py-1.5 text-left hover:bg-sunk"
				onClick={onOpen}
				type="button"
			>
				<span className="shrink-0 text-13 text-ink">{favourite.name}</span>
				<span className="min-w-0 truncate text-12 text-faint">{favourite.why ?? ''}</span>
				{favourite.preferFor.length === 0 ? null : (
					<span className="ml-auto shrink-0 text-11 text-faint">
						{favourite.preferFor.join(' · ')}
					</span>
				)}
			</button>
		</li>
	)
}

interface FavouriteRowProps {
	favourite: Favourite
	onEdit: (draft: FavouriteDraft) => void
	onRemove: () => void
	onClose: () => void
}

/**
 * One favourite, edited in place. The text fields write once the writer leaves
 * them, the way a Lexicon entry does, and a subject chip writes as soon as it
 * is added or dropped, because there is no field to leave.
 */
function FavouriteRow({ favourite, onEdit, onRemove, onClose }: FavouriteRowProps) {
	const [name, setName] = useState(favourite.name)
	const [why, setWhy] = useState(favourite.why ?? '')
	const [notFor, setNotFor] = useState(favourite.notFor ?? '')

	const draft = (preferFor: string[]): FavouriteDraft => ({
		type: favourite.type,
		name,
		why,
		preferFor,
		notFor,
	})

	const commit = () => {
		if (name.trim() === '') {
			setName(favourite.name)

			return
		}
		if (
			name.trim() === favourite.name &&
			why.trim() === (favourite.why ?? '') &&
			notFor.trim() === (favourite.notFor ?? '')
		)
			return

		onEdit(draft(favourite.preferFor))
	}

	const source = favourite.type !== 'idea'

	return (
		<li className="flex flex-col gap-1.5 border-b border-rule py-2 last:border-b-0">
			<FieldRow label="Name">
				<div className="flex items-center gap-2">
					<TextField
						className="flex-1"
						hiddenLabel={`Name: ${favourite.name}`}
						onBlur={commit}
						onChange={setName}
						size="sm"
						value={name}
					/>
					<Button
						aria-label={`Delete ${favourite.name}`}
						onClick={onRemove}
						size="sm"
						variant="quiet"
					>
						delete
					</Button>
					<Button aria-expanded onClick={onClose} size="sm" variant="quiet">
						done
					</Button>
				</div>
			</FieldRow>
			<FieldRow label="Why">
				<TextField
					hiddenLabel={`Why you prefer ${favourite.name}`}
					onBlur={commit}
					onChange={setWhy}
					placeholder={source ? 'Why you prefer it' : 'What you mean by it'}
					rows={2}
					value={why}
				/>
			</FieldRow>
			{source ? (
				<>
					<FieldRow label="Prefer for">
						<TermChips
							addLabel={`Add a subject you prefer ${favourite.name} for`}
							onTerms={(preferFor) => onEdit(draft(preferFor))}
							placeholder="+ subject"
							removeLabel={(subject) =>
								`Stop preferring ${favourite.name} for ${subject}`
							}
							terms={favourite.preferFor}
						/>
					</FieldRow>
					<FieldRow label="Not for">
						<TextField
							hiddenLabel={`What ${favourite.name} is not for`}
							onBlur={commit}
							onChange={setNotFor}
							placeholder="Opinion columns and the weekend essay."
							size="sm"
							value={notFor}
						/>
					</FieldRow>
				</>
			) : null}
		</li>
	)
}
