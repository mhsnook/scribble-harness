import { AIChatAgent, type OnChatMessageOptions } from '@cloudflare/ai-chat'
import { callable, type Connection, type ConnectionContext } from 'agents'
import { type GenerateTextOnFinishCallback, type LanguageModel, type ToolSet } from 'ai'
import {
	isPartyDbRequest,
	PartyDbCore,
	type SqlEngine,
	SqliteAdapter,
} from 'party-db/server'
import { z } from 'zod'

import { chatRequestBody } from '../shared/chat'
import {
	type BlockJson,
	type BlockRow,
	checkChangeSize,
	type DraftChange,
	draftChangeSchema,
	type DraftSaved,
} from '../shared/draft'
import { reasonFor } from '../shared/failure'
import {
	alreadyRuled,
	missingNote,
	type Note,
	type NoteContent,
	type NoteDisposition,
	type NoteRuling,
	noteRulingSchema,
	notAccepted,
	notRestorable,
	restoredTo,
	settleAnchor,
} from '../shared/note'
import {
	type Disposition,
	missingOffer,
	notDeclined,
	type Offer,
	offerBatchSchema,
	offerFingerprint,
	type Ruling,
	rulingSchema,
} from '../shared/offer'
import {
	emptyPlan,
	type Plan,
	type PlanRefused,
	planSchema,
	type ReferenceContent,
	referenceContentSchema,
	type ReferenceType,
	sectionIds,
	type Source,
} from '../shared/plan'
import {
	type ReviewOutput,
	reviewAlreadyRunning,
	type ReviewRequest,
	reviewRequestSchema,
	type Round,
	type RoundPassage,
	type RoundState,
} from '../shared/review'
import {
	type NoteRow,
	type RoundRow,
	syncCollections,
	toNote,
	toRound,
} from '../shared/sync'
import { chatTurn } from './llm/chat-turn'
import { model } from './llm/model'
import { reviewTurn } from './llm/review'
import type { ReviewPack } from './llm/review-pack'
import { webSearch, type WebSearch } from './llm/search'

/** One Offer row as SQLite returns it. `this.sql` asserts the row type rather
 * than checking it, and this class is the table's only writer, so the columns
 * are stated as what `createOffer` parsed before writing them. */
type OfferRow = {
	seq: number
	id: string
	type: ReferenceType
	disposition: Disposition
	text: string | null
	source: string | null
	note: string | null
	created_at: number
	decided_at: number | null
}

function toOffer(row: OfferRow): Offer {
	return {
		id: row.id,
		type: row.type,
		disposition: row.disposition,
		text: row.text ?? undefined,
		source: row.source === null ? undefined : (JSON.parse(row.source) as Source),
		note: row.note ?? undefined,
		createdAt: row.created_at,
		decidedAt: row.decided_at,
	}
}

/** One Block row as SQLite returns it, read the same way `OfferRow` is. */
type BlockDbRow = {
	id: string
	ord: number
	json: string
	updated_at: number
}

function toBlock(row: BlockDbRow): BlockRow {
	return { id: row.id, ord: row.ord, json: JSON.parse(row.json) as BlockJson }
}

/** The Note and Round row shapes and their readers live in `shared/sync.ts`
 * now, because the rows travel: a synced client reads the same columns this
 * class writes. What stays here is the writing. */

/** The connection tag party-db subscribers carry, so a broadcast can leave
 * them out and the sync fan-out can find them — tags survive hibernation
 * where a field would not. */
const PARTY_DB_TAG = 'party-db'

/** `duplicate` means the row was already there and nothing was written. */
export type RecordedOffer = { offer: Offer; duplicate: boolean }

/**
 * One Article Agent per Article — docs/architecture.md §2, and §3 for what goes
 * in the state blob against what goes in its SQLite. `AIChatAgent` adds the
 * Chat: it keeps the transcript in its own SQLite tables, which nothing
 * mirrors, and routes a turn to `onChatMessage` below (§6).
 */
export class ArticleAgent extends AIChatAgent<Env, Plan> {
	initialState = emptyPlan()

	/** The party-db room composed into this Agent — architecture.md §12. Built
	 * fresh on every wake in `onStart`, which partyserver runs before any
	 * connect, request, or RPC reaches this class. */
	db!: PartyDbCore

	/** Runs on every wake, so every statement here has to be idempotent. A new
	 * table can join this one. A new column cannot go in bare — SQLite has no
	 * ADD COLUMN IF NOT EXISTS, so the second wake throws on a duplicate and
	 * takes the Chat and the Plan down with it. `pragma_table_info` is what makes
	 * a guarded ALTER possible when a column does have to change. */
	async onStart(): Promise<void> {
		this.sql`
			CREATE TABLE IF NOT EXISTS offer (
				seq INTEGER PRIMARY KEY AUTOINCREMENT,
				id TEXT NOT NULL UNIQUE,
				type TEXT NOT NULL,
				disposition TEXT NOT NULL,
				text TEXT,
				source TEXT,
				note TEXT,
				created_at INTEGER NOT NULL,
				decided_at INTEGER
			)
		`

		// One row per Block, ordered by a fractional index the client assigns.
		// `json` is the editor's own document JSON for that Block, which is why
		// nothing else here describes the content: a change to what a Block can
		// hold is a change inside that column and not a change to this table.
		this.sql`
			CREATE TABLE IF NOT EXISTS block (
				id TEXT PRIMARY KEY,
				ord REAL NOT NULL,
				json TEXT NOT NULL,
				updated_at INTEGER NOT NULL
			)
		`
		this.sql`CREATE INDEX IF NOT EXISTS block_by_ord ON block (ord)`

		// One row per Review. `seq` is what the writer reads as "Round 3", and
		// `state` is why the row exists at all: the Article Agent runs the Review,
		// so a writer can start one and close the tab, and both "still running" and
		// "failed while nobody was watching" have to survive them leaving (§3,
		// rule 4).
		this.sql`
			CREATE TABLE IF NOT EXISTS round (
				seq INTEGER PRIMARY KEY AUTOINCREMENT,
				id TEXT NOT NULL UNIQUE,
				state TEXT NOT NULL,
				prompt TEXT NOT NULL,
				depth TEXT NOT NULL,
				passages TEXT NOT NULL,
				failure TEXT,
				started_at INTEGER NOT NULL,
				finished_at INTEGER
			)
		`

		// One row per Note. `anchor` is JSON because it is a union of three shapes
		// and only the client reads inside it — columns would make a Section anchor
		// and a Block run share a table of nulls.
		this.sql`
			CREATE TABLE IF NOT EXISTS note (
				seq INTEGER PRIMARY KEY AUTOINCREMENT,
				id TEXT NOT NULL UNIQUE,
				round_id TEXT NOT NULL,
				type TEXT NOT NULL,
				anchor TEXT NOT NULL,
				label TEXT,
				body TEXT NOT NULL,
				disposition TEXT NOT NULL,
				created_at INTEGER NOT NULL,
				decided_at INTEGER
			)
		`
		this.sql`CREATE INDEX IF NOT EXISTS note_by_round ON note (round_id)`

		// One Review at a time per Article, enforced by the table itself: at most
		// one row may read `running`. The pre-check in `startReview` gives the
		// friendly refusal; this index is what holds when two calls interleave
		// across `commit`'s await (#9).
		this.sql`
			CREATE UNIQUE INDEX IF NOT EXISTS round_one_running
			ON round (state) WHERE state = 'running'
		`

		// The party-db core, held rather than inherited: this class already
		// extends AIChatAgent. The tables above stay this class's own DDL — the
		// core only CRUDs over them, adds its `_oplog`, and fans committed
		// batches out to the connections tagged party-db.
		//
		// Retention 200 against the default 10,000 — §11: low retention pushes a
		// returning client onto the cheap snapshot path.
		const engine: SqlEngine = {
			exec: (query, ...bindings) => this.ctx.storage.sql.exec(query, ...bindings),
			transaction: (fn) => this.ctx.storage.transactionSync(fn),
		}
		this.db = new PartyDbCore({
			collections: syncCollections,
			adapter: new SqliteAdapter(engine, syncCollections, { oplogRetention: 200 }),
			broadcast: (message) => {
				for (const connection of this.getConnections(PARTY_DB_TAG)) {
					connection.send(message)
				}
			},
		})
		await this.db.init()

		// A Review runs under `waitUntil`, which holds this Agent awake until it
		// settles — so a `running` row seen at wake is one a crash or deploy cut
		// off. Failing it here frees the one-at-a-time guard and puts the reason
		// where the writer looks. Through `commit`, not raw SQL: a subscriber
		// that watched the Round start has to hear it fail.
		const cut = this.sql<{ id: string }>`SELECT id FROM round WHERE state = 'running'`
		if (cut.length > 0) {
			await this.db.commit([
				{
					channel: 'round',
					ops: cut.map(({ id }) => ({
						type: 'update' as const,
						value: roundSettled(
							id,
							'failed',
							'[]',
							'The Review was cut off by a restart.',
						),
					})),
				},
			])
		}
	}

	/** party-db marks its own traffic with `?proto=party-db`, so routing needs no
	 * configuration; tags are what survive hibernation, so the broadcast override
	 * and the sync fan-out both read them rather than the request. */
	getConnectionTags(_connection: Connection, ctx: ConnectionContext): string[] {
		return isPartyDbRequest(ctx.request) ? [PARTY_DB_TAG] : []
	}

	/** Keeps the SDK's connect handshake — identity, `cf_agent_state`, MCP — off
	 * sync subscribers, and keeps them out of its protocol broadcasts. */
	shouldSendProtocolMessages(_connection: Connection, ctx: ConnectionContext): boolean {
		return !isPartyDbRequest(ctx.request)
	}

	/** Every broadcast leaves the party-db connections out — the SDK's own
	 * (state sync, Chat streams) and this class's (`plan_refused`) all pass
	 * through here. A sync subscriber hears `SequencedBatch` frames and nothing
	 * else; the core's fan-out is scoped by the tag in `onStart`. */
	broadcast(message: string | ArrayBuffer | ArrayBufferView, without?: string[]): void {
		const skip = without === undefined ? [] : [...without]
		for (const connection of this.getConnections(PARTY_DB_TAG)) {
			skip.push(connection.id)
		}
		super.broadcast(message, skip)
	}

	/** A marked connect is a sync subscriber: the core answers it — a snapshot,
	 * or the delta after its `?since` cursor — and nothing else on this class
	 * speaks to it again. */
	onConnect(connection: Connection, ctx: ConnectionContext): void | Promise<void> {
		const url = new URL(ctx.request.url)
		if (isPartyDbRequest(url)) {
			return this.db.connect((message) => connection.send(message), url)
		}

		return super.onConnect(connection, ctx)
	}

	/**
	 * The pilot syncs reads only, so a party-db write POST is refused rather
	 * than routed to the core: rulings are server-side state-machine moves and
	 * party-db has no per-row policy layer to hold their guards yet (party-db
	 * #33). The refusal keeps that a decision — forwarding to
	 * `this.db.handleWrite` is the whole change when a client-authored
	 * collection arrives.
	 */
	async onRequest(request: Request): Promise<Response> {
		if (isPartyDbRequest(request)) {
			return Response.json(
				{
					error: 'This Article accepts no client collection writes. Rulings go over RPC.',
				},
				{ status: 403 },
			)
		}

		return Response.json({ agent: 'ArticleAgent', name: this.name })
	}

	/** The model a Chat turn runs on — one model currently serves every call
	 * (§7). `llm/model.ts` is the boundary; this reads it so a workerd test,
	 * which has no Workers AI binding to reach, can put a scripted model behind
	 * it. */
	chatModel(): LanguageModel {
		return model(this.env)
	}

	/** The search a Chat turn runs on, undefined where no key is set.
	 * `llm/search.ts` is the boundary; this reads it so a test can replace it,
	 * as `chatModel` does for the model. */
	chatSearch(): WebSearch | undefined {
		return webSearch(this.env)
	}

	/** The model a Review runs on — the same one, read separately so a test can
	 * script a Review without scripting the Chat. */
	reviewModel(): LanguageModel {
		return model(this.env)
	}

	/**
	 * One Chat turn. `llm/chat-turn.ts` composes it; this supplies the three
	 * things only the Article Agent holds — the model, the Plan, and the
	 * transcript — and hands back the stream.
	 */
	async onChatMessage(
		onFinish: GenerateTextOnFinishCallback<ToolSet>,
		options?: OnChatMessageOptions,
	): Promise<Response> {
		return chatTurn({
			model: this.chatModel(),
			search: this.chatSearch(),
			plan: this.planForTurn(options?.body),
			messages: this.messages,
			abortSignal: options?.abortSignal,
			onFinish,
		})
	}

	/**
	 * The Plan the turn is about. The client sends it in `body`, never in
	 * `metadata`, which persists on the `UIMessage` and re-rides every turn
	 * (§6).
	 *
	 * **The body wins over state, and the two can disagree.** A client that
	 * applies a Proposal and sends the next turn before its `setState` lands
	 * holds a newer Plan than the Agent stored, and the turn should be about the
	 * one the writer is looking at. Nothing reconciles them, so the model can be
	 * shown a Plan this Agent never stored — which is correct here and is a fact
	 * #26 has to build for.
	 *
	 * An absent Plan is ordinary: a turn the client did not originate carries no
	 * body, and state is the only Plan there is. One that is present and does
	 * not parse is a bug, and refusing the turn is what says so.
	 */
	private planForTurn(body: Record<string, unknown> | undefined): Plan {
		const sent = chatRequestBody.safeParse(body ?? {})
		if (!sent.success) {
			// Same shape as validateStateChange: the frame carries which rule
			// failed, because whatever renders a thrown turn will not. It goes to
			// every connection rather than to one, since onChatMessage is not told
			// which of them sent the turn.
			const reason = z.prettifyError(sent.error)
			const refusal: PlanRefused = { type: 'plan_refused', error: reason }
			this.broadcast(JSON.stringify(refusal))

			throw new Error(`The Plan sent with this turn does not parse. ${reason}`)
		}

		return sent.data.plan ?? this.state
	}

	/**
	 * The only guard on the blob. Every write is parsed, whatever its source:
	 * the client is the Plan's one writer, so a server write is already a bug.
	 */
	validateStateChange(nextState: Plan, source: Connection | 'server'): void {
		const result = planSchema.safeParse(nextState)
		if (result.success) return

		const reason = z.prettifyError(result.error)
		if (source !== 'server') {
			const refusal: PlanRefused = { type: 'plan_refused', error: reason }
			source.send(JSON.stringify(refusal))
		}

		throw new Error(`The Plan does not parse. ${reason}`)
	}

	/** Every Offer on this Article, in the order they were recorded.
	 *
	 * `seq` orders it, not `created_at`: a Worker's clock does not advance
	 * across local writes, so a research turn that records four Offers stamps
	 * them with one or two milliseconds between them. */
	@callable()
	listOffers(): Offer[] {
		return this.sql<OfferRow>`SELECT * FROM offer ORDER BY seq`.map(toOffer)
	}

	/**
	 * One research turn. An entry this Article already carries comes back as it
	 * stands, keeping the disposition the writer gave it — §5.
	 *
	 * Not `@callable`, and neither is `createOffer`: the research tool is the
	 * only caller and it runs inside this Agent (§3, rule 4).
	 */
	recordOffers(batch: unknown): RecordedOffer[] {
		const found = offerBatchSchema.parse(batch)

		// Added to as the batch is written, so a turn dedupes against itself.
		const held = new Map(
			this.listOffers().map((offer) => [offerFingerprint(offer), offer]),
		)

		return found.map((material) => {
			const fingerprint = offerFingerprint(material)
			const already = held.get(fingerprint)
			if (already !== undefined) return { offer: already, duplicate: true }

			const offer = this.createOffer(material)
			held.set(fingerprint, offer)

			return { offer, duplicate: false }
		})
	}

	/** Starts Undecided. */
	createOffer(content: ReferenceContent): Offer {
		const offer: Offer = {
			...referenceContentSchema.parse(content),
			id: crypto.randomUUID(),
			disposition: 'undecided',
			createdAt: Date.now(),
			decidedAt: null,
		}

		this.sql`
			INSERT INTO offer (id, type, disposition, text, source, note, created_at, decided_at)
			VALUES (
				${offer.id},
				${offer.type},
				${offer.disposition},
				${offer.text ?? null},
				${offer.source === undefined ? null : JSON.stringify(offer.source)},
				${offer.note ?? null},
				${offer.createdAt},
				${offer.decidedAt}
			)
		`

		return offer
	}

	/** Mark an Offer as having been Accepted or Declined by the client. */
	@callable()
	setOfferDisposition(id: string, disposition: Ruling): Offer {
		const ruling = rulingSchema.parse(disposition)

		const rows = this.sql<OfferRow>`
			UPDATE offer SET disposition = ${ruling}, decided_at = ${Date.now()}
			WHERE id = ${id} RETURNING *
		`
		if (rows.length === 0) throw missingOffer(id)

		return toOffer(rows[0])
	}

	/** Restore a Declined Offer back to Undecided. */
	@callable()
	restoreOffer(id: string): Offer {
		// Read first: an Offer that is Accepted and one that does not exist have
		// to be told apart, and one conditional UPDATE cannot do that.
		const offer = this.readOffer(id)
		if (offer.disposition !== 'declined') throw notDeclined(offer)

		const rows = this.sql<OfferRow>`
			UPDATE offer SET disposition = 'undecided', decided_at = NULL
			WHERE id = ${id} RETURNING *
		`

		return toOffer(rows[0])
	}

	private readOffer(id: string): Offer {
		const rows = this.sql<OfferRow>`SELECT * FROM offer WHERE id = ${id}`
		if (rows.length === 0) throw missingOffer(id)

		return toOffer(rows[0])
	}

	/** The whole Draft, in reading order. Empty for an Article nobody has
	 * written in yet, which is how the Panel tells "still loading" from
	 * "nothing here" — so this answers rather than throwing. */
	@callable()
	listBlocks(): BlockRow[] {
		return this.sql<BlockDbRow>`SELECT * FROM block ORDER BY ord`.map(toBlock)
	}

	/**
	 * One save. A delta rather than the whole Draft: a client can only name a
	 * Block it has already seen, so a second tab's paragraph is not something
	 * this one can delete.
	 *
	 * The content is stored, not inspected — §3 leaves the client as the Draft's
	 * only writer, and reading the document here would put the editor's schema in
	 * the Worker. Size is checked, because that is the failure the writer cannot
	 * see coming.
	 */
	@callable()
	saveBlocks(change: unknown): DraftSaved {
		const { blocks, removed } = draftChangeSchema.parse(change) as DraftChange
		checkChangeSize({ blocks, removed })

		const savedAt = Date.now()

		// Removals first, so a Block taken out and put back under the same id
		// ends up present. Nothing checks a row count, unlike the Offer methods:
		// removing a Block that has already gone is the retry path — the save
		// failed, the writer kept typing — and it has to land rather than throw.
		for (const id of removed) {
			this.sql`DELETE FROM block WHERE id = ${id}`
		}

		for (const block of blocks) {
			this.sql`
				INSERT INTO block (id, ord, json, updated_at)
				VALUES (${block.id}, ${block.ord}, ${JSON.stringify(block.json)}, ${savedAt})
				ON CONFLICT(id) DO UPDATE SET
					ord = excluded.ord,
					json = excluded.json,
					updated_at = excluded.updated_at
			`
		}

		return { savedAt, written: blocks.length, removed: removed.length }
	}

	/** Every Round on this Article, oldest first. `seq` orders it and numbers it,
	 * for the reason `listOffers` gives: a Worker's clock barely moves across
	 * local writes. Not `@callable`: a client reads Rounds off its synced
	 * collection now, so this reader serves this class and its tests. */
	listRounds(): Round[] {
		return this.sql<RoundRow>`SELECT * FROM round ORDER BY seq`.map(toRound)
	}

	/** Every Note on this Article, in the order the Guide wrote them. Not
	 * `@callable`, for the reason `listRounds` gives. */
	listNotes(): Note[] {
		return this.sql<NoteRow>`SELECT * FROM note ORDER BY seq`.map(toNote)
	}

	/**
	 * Start one Review, and answer with the Round it will land in.
	 *
	 * The Article Agent runs it, not the client: this returns as soon as the
	 * row exists, the model call carries on under `waitUntil`, and one Review
	 * runs at a time, guarded by the running row — §12 for the full argument.
	 */
	@callable()
	async startReview(request: unknown): Promise<Round> {
		const asked = reviewRequestSchema.parse(request)

		const running = this.runningRound()
		if (running !== null) throw reviewAlreadyRunning(running)

		const round = await this.createRound(asked)
		this.ctx.waitUntil(this.finishReview(round, asked))

		return round
	}

	/** The Review in flight, and null when none is. */
	private runningRound(): Round | null {
		const rows = this.sql<RoundRow>`
			SELECT * FROM round WHERE state = 'running' ORDER BY seq LIMIT 1
		`

		return rows.length === 0 ? null : toRound(rows[0])
	}

	/** The insert goes through `commit`, so every subscriber sees the Round
	 * start; the resolved row carries the `seq` the table assigned, which is
	 * the ordinal the writer reads. */
	private async createRound(asked: ReviewRequest): Promise<Round> {
		const value: RoundRow = {
			id: crypto.randomUUID(),
			state: 'running',
			prompt: asked.prompt,
			depth: asked.depth,
			passages: '[]',
			failure: null,
			started_at: Date.now(),
			finished_at: null,
		}

		try {
			const [batch] = await this.db.commit([
				{ channel: 'round', ops: [{ type: 'insert', value }] },
			])

			return toRound(batch.ops[0].value as RoundRow)
		} catch (error) {
			// The `round_one_running` index refused a second running row — the
			// race the pre-check above cannot close, since two calls interleave
			// across this await (#9). Re-read to name the Round that won.
			const running = this.runningRound()
			if (running !== null) throw reviewAlreadyRunning(running)

			throw error
		}
	}

	/**
	 * The Review itself, off the caller's thread.
	 *
	 * Nothing here throws. The writer may be gone by now, so a failure has to
	 * land on the row where they will find it rather than on a call nobody is
	 * holding.
	 */
	private async finishReview(round: Round, asked: ReviewRequest): Promise<void> {
		// Read once and used twice — for the pack, and for settling the anchors the
		// model answers with. Reading again afterwards would check the ids against
		// a different Plan from the one the model was shown, so a Section the
		// client had just added would lose its anchor.
		const pack = {
			// The Plan the writer is looking at, for the reason `planForTurn` gives,
			// and state where the client sent none.
			plan: asked.plan ?? this.state,
			blocks: this.listBlocks(),
			notes: this.openNotes(),
			prompt: asked.prompt,
		}

		try {
			const output = await reviewTurn({
				model: this.reviewModel(),
				depth: asked.depth,
				pack,
			})

			await this.writeReview(round, output, pack)
		} catch (error) {
			await this.failRound(round.id, reasonFor(error))
		}
		// Nothing announces the settle: the commits above are the announcement.
		// Every subscriber hears the rows land, and a client that was away
		// catches up from its `?since` cursor when it reconnects.
	}

	/**
	 * The response, as rows — the Notes and the settled Round in one `commit`,
	 * so a subscriber that hears the Round settle already holds its Notes.
	 * Each Note keeps the id its passage names it by, so the written response
	 * and the Notes queue are two readings of one set of records and a ruling
	 * made on either is made on both.
	 */
	private async writeReview(
		round: Round,
		output: ReviewOutput,
		pack: ReviewPack,
	): Promise<void> {
		const known = {
			nodeIds: sectionIds(pack.plan),
			blockIds: pack.blocks.map((block) => block.id),
		}

		const notes: NoteRow[] = []
		const passages = output.passages.map((passage): RoundPassage => {
			const noteIds = passage.notes.map((content) => {
				const note = noteRow(round.id, content, known)
				notes.push(note)

				return note.id
			})

			return {
				prose: passage.prose,
				...(passage.label === undefined ? {} : { label: passage.label }),
				noteIds,
			}
		})

		await this.db.commit([
			...(notes.length === 0
				? []
				: [
						{
							channel: 'note',
							ops: notes.map((value) => ({ type: 'insert' as const, value })),
						},
					]),
			{
				channel: 'round',
				ops: [
					{
						type: 'update' as const,
						value: roundSettled(round.id, 'done', JSON.stringify(passages), null),
					},
				],
			},
		])
	}

	/**
	 * What the next Review is bound by — the Notes the writer accepted and has not
	 * resolved.
	 *
	 * Filtered in SQL rather than by reading every Note and dropping most of them:
	 * an Article ten Rounds in holds hundreds of rows, and each one read costs a
	 * `JSON.parse` of its anchor to produce a handful the pack will use.
	 */
	private openNotes(): Note[] {
		return this.sql<NoteRow>`
			SELECT * FROM note WHERE disposition = 'accepted' ORDER BY seq
		`.map(toNote)
	}

	/** A Review that threw. The reason goes on the row because the writer may
	 * have left, and a thrown call has nowhere to land — §12. A commit that
	 * fails here has no row left to land on either, so it is logged and
	 * swallowed rather than thrown into `waitUntil`. */
	private async failRound(id: string, failure: string): Promise<void> {
		try {
			await this.db.commit([
				{
					channel: 'round',
					ops: [{ type: 'update', value: roundSettled(id, 'failed', '[]', failure) }],
				},
			])
		} catch (error) {
			console.error('The failed Round could not be recorded:', error)
		}
	}

	/** The writer's ruling on one proposed Note. */
	@callable()
	async setNoteDisposition(id: string, ruling: NoteRuling): Promise<Note> {
		const ruled = noteRulingSchema.parse(ruling)

		// Read first, so a Note that has already been ruled on and one that does
		// not exist are told apart — the same reason `restoreOffer` reads first.
		const note = this.readNote(id)
		if (note.disposition !== 'proposed') throw alreadyRuled(note)

		return this.moveNote(id, ruled)
	}

	/** The writer has dealt with an accepted Note. */
	@callable()
	async resolveNote(id: string): Promise<Note> {
		const note = this.readNote(id)
		if (note.disposition !== 'accepted') throw notAccepted(note)

		return this.moveNote(id, 'resolved')
	}

	/** Undo the last move: a declined Note goes back to proposed, and a resolved
	 * one back to accepted. */
	@callable()
	async restoreNote(id: string): Promise<Note> {
		const note = this.readNote(id)
		const back = restoredTo(note.disposition)
		if (back === null) throw notRestorable(note)

		return this.moveNote(id, back)
	}

	/** `decided_at` is the moment the Note stopped being the Guide's and became
	 * the writer's, so restoring to proposed clears it. The move goes through
	 * `commit` — RPC keeps the guards above, `commit` makes the ruled row sync —
	 * and the update names only the columns it moves. */
	private async moveNote(id: string, disposition: NoteDisposition): Promise<Note> {
		const [batch] = await this.db.commit([
			{
				channel: 'note',
				ops: [
					{
						type: 'update',
						value: {
							id,
							disposition,
							decided_at: disposition === 'proposed' ? null : Date.now(),
						},
					},
				],
			},
		])

		return toNote(batch.ops[0].value as NoteRow)
	}

	private readNote(id: string): Note {
		const rows = this.sql<NoteRow>`SELECT * FROM note WHERE id = ${id}`
		if (rows.length === 0) throw missingNote(id)

		return toNote(rows[0])
	}
}

/** One Note as a row, ready to commit. Starts proposed; the anchor is settled
 * here, once, against what the Review was shown (§12). */
function noteRow(
	roundId: string,
	content: NoteContent,
	known: { nodeIds: ReadonlySet<string>; blockIds: readonly string[] },
): NoteRow {
	return {
		id: crypto.randomUUID(),
		round_id: roundId,
		type: content.type,
		anchor: JSON.stringify(settleAnchor(content.anchor, known)),
		label: content.label ?? null,
		body: content.body,
		disposition: 'proposed',
		created_at: Date.now(),
		decided_at: null,
	}
}

/** The columns that settle a Round, as one update value. `passages` arrives
 * already as JSON text, because the wire carries the column. */
function roundSettled(
	id: string,
	state: RoundState,
	passages: string,
	failure: string | null,
): Partial<RoundRow> & { id: string } {
	return { id, state, passages, failure, finished_at: Date.now() }
}
