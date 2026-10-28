import { useState } from 'react'

import type { StandingRule } from '../../shared/house'
import { Button } from '../components/Button'
import { GroupHeading } from '../components/Divider'
import { EmptySlot, TextField } from '../components/Field'

/**
 * The standing rules — what the writer holds every piece to, in their own
 * words. A list rather than one block of text: the writer adds, drops, and
 * reorders one rule without retyping the rest, and each rule reaches the guide
 * as its own line.
 */

export interface StandingRulesProps {
	rules: readonly StandingRule[]
	onAdd: (body: string) => void
	onEdit: (id: string, body: string) => void
	onRemove: (id: string) => void
	onMove: (id: string, to: number) => void
}

export function StandingRules({
	rules,
	onAdd,
	onEdit,
	onRemove,
	onMove,
}: StandingRulesProps) {
	const [adding, setAdding] = useState('')

	const add = () => {
		const body = adding.trim()
		if (body === '') return

		onAdd(body)
		setAdding('')
	}

	return (
		<div className="flex flex-col gap-3">
			<GroupHeading count={rules.length}>Standing rules</GroupHeading>

			{rules.length === 0 ? (
				<EmptySlot>
					No rules yet. A rule you write here applies to every piece, on top of its own
					Plan.
				</EmptySlot>
			) : (
				<ol className="flex flex-col gap-2">
					{rules.map((rule, index) => (
						<RuleRow
							canMoveDown={index < rules.length - 1}
							canMoveUp={index > 0}
							key={rule.id}
							onDown={() => onMove(rule.id, index + 1)}
							onEdit={(body) => onEdit(rule.id, body)}
							onRemove={() => onRemove(rule.id)}
							onUp={() => onMove(rule.id, index - 1)}
							rule={rule}
						/>
					))}
				</ol>
			)}

			<div className="flex items-end gap-2 rounded-md border border-dashed border-edge p-2.5">
				<TextField
					className="flex-1"
					hiddenLabel="A new standing rule"
					onChange={setAdding}
					onKeyDown={(event) => {
						if (event.key !== 'Enter') return
						event.preventDefault()
						add()
					}}
					placeholder="Never open a piece with a rhetorical question."
					rows={2}
					value={adding}
				/>
				<Button disabled={adding.trim() === ''} onClick={add} size="sm">
					+ add rule
				</Button>
			</div>
		</div>
	)
}

interface RuleRowProps {
	rule: StandingRule
	canMoveUp: boolean
	canMoveDown: boolean
	onEdit: (body: string) => void
	onRemove: () => void
	onUp: () => void
	onDown: () => void
}

function RuleRow({
	rule,
	canMoveUp,
	canMoveDown,
	onEdit,
	onRemove,
	onUp,
	onDown,
}: RuleRowProps) {
	const [body, setBody] = useState(rule.body)

	// Emptying a rule means deleting it, and the writer has a delete button for
	// that, so an empty field reverts rather than writing a rule that says
	// nothing.
	const commit = () => {
		const next = body.trim()
		if (next === '') {
			setBody(rule.body)

			return
		}
		if (next === rule.body) return

		onEdit(next)
	}

	return (
		<li className="flex items-start gap-2">
			<TextField
				className="flex-1"
				hiddenLabel={`Rule: ${rule.body}`}
				onBlur={commit}
				onChange={setBody}
				rows={2}
				value={body}
			/>
			<div className="flex shrink-0 items-center gap-1 pt-1">
				<Button
					aria-label="Move this rule up"
					disabled={!canMoveUp}
					onClick={onUp}
					size="sm"
					variant="quiet"
				>
					↑
				</Button>
				<Button
					aria-label="Move this rule down"
					disabled={!canMoveDown}
					onClick={onDown}
					size="sm"
					variant="quiet"
				>
					↓
				</Button>
				<Button
					aria-label="Delete this rule"
					onClick={onRemove}
					size="sm"
					variant="quiet"
				>
					×
				</Button>
			</div>
		</li>
	)
}
