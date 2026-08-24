import { useCallback, useMemo, useState } from 'react'

import type { Plan, ProposalInput } from '../../shared/plan'
import { sectionIsEmpty } from '../../shared/plan'
import { cx } from '../lib/cx'
import { addSection, deleteSection } from './edits'
import type { MapBranches, MapNode } from './map'
import { planMap } from './map'
import { outlineEntries } from './outline'
import { referenceMark } from './references'
import { SectionRow } from './SectionRow'

/**
 * A mind-map View of the Plan, opening left to right from the Article title.
 *
 * `map.ts` places every box and curve. This component draws them, anchors the
 * open Section's fields over the box they belong to, and holds what the writer
 * has folded, lit, or opened.
 *
 * The map draws at its own size and scrolls sideways rather than scaling to
 * fit, because the anchored fields are positioned in the map's own units.
 */

/** How wide the open Section's fields sit, in the map's own units. */
const DETAIL_WIDTH = 520

/** Room around the drawing, so a lit box's border is not clipped. */
const PADDING = 12

export interface PlanMapProps {
	plan: Plan
	/** The Plan's one writer, taken as the Panel takes it. */
	edit: (ops: ProposalInput | null) => void
	/** What branches off a Section — `map.ts`. */
	branches?: MapBranches
	className?: string
}

export function PlanMap({
	plan,
	edit,
	branches = 'references',
	className,
}: PlanMapProps) {
	// None of this is in the Plan: the map opens unfolded and shut every time.
	const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())
	const [lit, setLit] = useState<string | null>(null)
	const [openId, setOpenId] = useState<string | null>(null)
	const [madeId, setMadeId] = useState<string | null>(null)
	const [detailHeight, setDetailHeight] = useState(0)

	// Measures the open fields, so the scroll area reaches their foot, and keeps
	// measuring: how tall they run changes as the writer types.
	const measure = useCallback((element: HTMLDivElement | null) => {
		if (element === null) return

		setDetailHeight(element.offsetHeight)
		element.scrollIntoView({ block: 'nearest', inline: 'nearest' })

		const observer = new ResizeObserver(() => setDetailHeight(element.offsetHeight))
		observer.observe(element)

		return () => observer.disconnect()
	}, [])

	// Held: a pointer sweeping the map fires `setLit` once per box, and the
	// layout is the same on every one of those renders.
	const { nodes, links, width, height } = useMemo(
		() => planMap(plan, { branches, collapsed }),
		[plan, branches, collapsed],
	)

	/** Closes the open Section, discarding one `+` made and left empty. */
	const close = () => {
		if (madeId !== null) {
			if (sectionIsEmpty(plan, madeId)) edit(deleteSection(madeId))
			setMadeId(null)
		}
		setOpenId(null)
	}

	const open = (id: string) => {
		close()
		setOpenId(id)
	}

	const fold = (nodeId: string) =>
		setCollapsed((held) => {
			const next = new Set(held)
			if (!next.delete(nodeId)) next.add(nodeId)

			return next
		})

	/** Adds a Section last inside `parentId`, open with the caret in its title.
	 * Null adds one to the Outline. */
	const add = (parentId: string | null) => {
		const id = crypto.randomUUID()
		close()
		edit(addSection({ parentId, beforeId: null }, id))

		// A child of a folded Section would land undrawn.
		if (parentId !== null) {
			setCollapsed((held) => {
				const next = new Set(held)
				next.delete(parentId)

				return next
			})
		}
		setOpenId(id)
		setMadeId(id)
	}

	// Looked up in what was drawn, not in the Plan: folding or deleting can leave
	// `openId` naming a box the map is not showing.
	const opened =
		nodes.find(
			(node) => node.subject.kind === 'section' && node.subject.node.id === openId,
		) ?? null
	const entry =
		openId === null || opened === null
			? null
			: (outlineEntries(plan.outline).find((one) => one.node.id === openId) ?? null)

	const detail = opened === null || entry === null ? null : { node: opened, entry }

	// The pointer wins over the open Section, so the writer can trace another
	// branch without shutting what they are editing.
	const onPath = new Set<string>()
	const traced = nodes.find((node) => node.key === (lit ?? opened?.key))
	if (traced !== undefined) {
		onPath.add(traced.key)
		for (const ancestor of traced.ancestors) onPath.add(ancestor)
	}

	const drawnWidth = width + PADDING * 2
	const drawnHeight = height + PADDING * 2

	return (
		<div
			// The browser test finds this box by the attribute rather than by a class.
			data-plan-map=""
			// `shrink-0`: `overflow-x-auto` zeroes this box's min-height, and the
			// Panel around it is a flex column that overflows.
			className={cx('relative shrink-0 overflow-x-auto', className)}
			onKeyDown={(event) => {
				// `SectionRow` stops its own Escape, so this one only reaches a box
				// the writer tabbed to.
				if (event.key !== 'Escape') return
				close()
			}}
		>
			<div
				className="relative"
				// Closes the open Section: boxes and its fields stop their own clicks,
				// so this one is on the space between them.
				onClick={close}
				style={{
					width:
						detail === null
							? drawnWidth
							: Math.max(drawnWidth, detail.node.x + PADDING + DETAIL_WIDTH),
					height:
						detail === null
							? drawnHeight
							: Math.max(drawnHeight, detail.node.y + PADDING + detailHeight),
				}}
			>
				<svg
					aria-label={`Map of ${plan.title === '' ? 'the article' : plan.title}`}
					className="block"
					height={drawnHeight}
					role="img"
					viewBox={`${-PADDING} ${-PADDING} ${drawnWidth} ${drawnHeight}`}
					width={drawnWidth}
				>
					{links.map((link) => (
						<path
							key={`${link.parentKey}→${link.childKey}`}
							className={cx(
								'fill-none transition-colors',
								onPath.has(link.parentKey) && onPath.has(link.childKey)
									? 'stroke-ink'
									: 'stroke-rule',
							)}
							d={link.d}
							strokeWidth={1.5}
						/>
					))}

					{nodes.map((node) => {
						// Destructured so the narrowing survives into the handlers below.
						const { subject } = node
						const section = subject.kind === 'section' ? subject.node : null
						// Where `+` would add a Section, or null where this box offers none.
						const addsInto =
							subject.kind === 'article'
								? { id: null }
								: section !== null && branches === 'sections'
									? { id: section.id }
									: null

						return (
							<foreignObject
								key={node.key}
								height={node.height}
								width={node.width}
								x={node.x}
								y={node.y}
							>
								<Box
									folded={node.collapsed}
									lit={onPath.has(node.key)}
									node={node}
									onAdd={addsInto === null ? undefined : () => add(addsInto.id)}
									onFold={section === null ? undefined : () => fold(section.id)}
									onLeave={() => setLit((held) => (held === node.key ? null : held))}
									onLight={() => setLit(node.key)}
									onOpen={section === null ? undefined : () => open(section.id)}
									open={section !== null && section.id === openId}
								/>
							</foreignObject>
						)
					})}
				</svg>

				{detail === null ? null : (
					<div
						ref={measure}
						// Grows out of the box's own top-left corner.
						className="absolute z-10 origin-top-left scale-100 rounded-md opacity-100 shadow-frame transition-[opacity,transform] duration-150 ease-out motion-reduce:transition-none starting:scale-95 starting:opacity-0"
						onClick={(event) => event.stopPropagation()}
						style={{
							left: detail.node.x + PADDING,
							top: detail.node.y + PADDING,
							width: DETAIL_WIDTH,
						}}
					>
						{/* No `onShowReference`: the map draws no References list. */}
						<SectionRow
							className="gap-3 p-3.5"
							edit={edit}
							entry={detail.entry}
							onOpen={close}
							open
							plan={plan}
						/>
					</div>
				)}
			</div>
		</div>
	)
}

interface BoxProps {
	node: MapNode
	lit: boolean
	folded: boolean
	open: boolean
	onFold?: () => void
	onOpen?: () => void
	onAdd?: () => void
	onLight: () => void
	onLeave: () => void
}

/**
 * The box drawn on the map for one node — the Article title, a Section, or a
 * Reference. Clicking anywhere on it opens that Section's fields, and the title
 * is a real button so the same is reachable by keyboard and named to a screen
 * reader. The controls for its own children sit on the right edge.
 *
 * Every control here stops its click, so only clicks on the map between boxes
 * reach `PlanMap` to close what is open.
 */
function Box({
	node,
	lit,
	folded,
	open,
	onFold,
	onOpen,
	onAdd,
	onLight,
	onLeave,
}: BoxProps) {
	const { subject } = node
	const untitled = node.title === ''
	const title = untitled
		? subject.kind === 'article'
			? 'Untitled article'
			: 'Untitled section'
		: node.title

	const target = subject.kind === 'section' ? subject.node.target : undefined
	const intent = subject.kind === 'section' ? subject.node.intent : undefined

	return (
		<div
			className={cx(
				'flex h-full w-full items-start gap-1.5 overflow-hidden rounded-md border bg-surface px-2 py-1.5 transition-colors',
				lit ? 'border-ink' : 'border-edge',
				onOpen && 'cursor-pointer',
			)}
			onClick={(event) => {
				event.stopPropagation()
				onOpen?.()
			}}
			onFocus={onLight}
			onBlur={onLeave}
			onMouseEnter={onLight}
			onMouseLeave={onLeave}
		>
			{node.ordinal === '' ? null : (
				<span className="mt-px shrink-0 font-mono text-11 text-faint">
					{node.ordinal}
				</span>
			)}

			<div className="flex min-w-0 flex-1 flex-col gap-0.5">
				{onOpen === undefined ? (
					<span
						className={cx(
							'line-clamp-2 text-13 leading-snug',
							subject.kind === 'article' && 'font-medium',
							subject.kind === 'reference' ? 'text-muted' : 'text-ink',
						)}
					>
						{title}
					</span>
				) : (
					<button
						aria-expanded={open}
						className={cx(
							'line-clamp-2 text-left text-13 leading-snug',
							untitled ? 'text-faint italic' : 'text-ink',
						)}
						onClick={(event) => {
							event.stopPropagation()
							onOpen()
						}}
						type="button"
					>
						{title}
					</button>
				)}

				{subject.kind === 'reference' ? (
					<span className="label-meta truncate">{referenceMark(subject)}</span>
				) : null}

				{target === undefined && intent === undefined ? null : (
					<span className="flex min-w-0 items-baseline gap-1.5 text-11 text-muted">
						{target === undefined ? null : (
							<span className="shrink-0 font-mono text-faint">{target}w</span>
						)}
						{intent === undefined ? null : <span className="truncate">{intent}</span>}
					</span>
				)}

				{/* Only drawn where References are not boxes of their own. */}
				{node.referenceNumbers.length === 0 ? null : (
					<span className="truncate font-mono text-10 text-faint">
						{`refs ${node.referenceNumbers.map((number) => `[${number}]`).join(' ')}`}
					</span>
				)}
			</div>

			{/* The two controls for this box's children, stacked: fold and add. */}
			{onFold === undefined && onAdd === undefined ? null : (
				<div className="flex h-full shrink-0 flex-col items-end">
					{node.childCount === 0 || onFold === undefined ? null : (
						<button
							aria-expanded={!folded}
							aria-label={`${folded ? 'Open' : 'Fold'} the ${node.childCount} inside ${title}`}
							className={CONTROL}
							onClick={(event) => {
								event.stopPropagation()
								onFold()
							}}
							type="button"
						>
							{folded ? node.childCount : '–'}
						</button>
					)}

					{onAdd === undefined ? null : (
						<button
							aria-label={
								subject.kind === 'article'
									? 'Add a Section to the Outline'
									: `Add a Section inside ${title}`
							}
							className={cx(CONTROL, 'mt-auto')}
							onClick={(event) => {
								event.stopPropagation()
								onAdd()
							}}
							type="button"
						>
							+
						</button>
					)}
				</div>
			)}
		</div>
	)
}

const CONTROL =
	'shrink-0 rounded-full border border-edge px-1 font-mono text-10 leading-[1.05rem] text-muted transition-colors hover:border-ink hover:text-ink'
