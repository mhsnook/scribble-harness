import { D1Adapter, type PersistenceAdapter, PartyDbServer } from 'party-db/server'

import {
	HOUSE_OPLOG_RETENTION,
	type HouseContext,
	houseCollections,
	type LexiconRow,
	type RuleRow,
	sortLexicon,
	sortRules,
	toHouseTone,
	type ToneRow,
	toLexiconEntry,
	toRule,
} from '../shared/house'

/**
 * The House — one party-db room persisted to D1, holding the Lexicon, the
 * standing rules, the Skills, and the House Tone. ADR 0001 for why it is one
 * room, `docs/house.md` for what it holds.
 *
 * Declaring the collections is the whole server. The class takes client writes
 * on party-db's own write path, which is the one thing the Article Agent's
 * composed core refuses: every House row is the writer's to author, and no
 * guard sits between them and it.
 *
 * Nothing here reads an identity. Access gates the Worker, one Team holds two
 * people, and both may read everything — `docs/architecture.md` §4.8. party-db
 * enforces no per-row policy either way (party-db#33), so a House that needed
 * one could not have it here.
 */
export class House extends PartyDbServer<Env> {
	collections = houseCollections
	oplogRetention = HOUSE_OPLOG_RETENTION

	/** D1 rather than this object's own SQLite: the House is the one room, and
	 * D1 is what `wrangler d1 export` can back up. The tables are
	 * `migrations/0002_house.sql`; the adapter brings only its `_oplog`. */
	protected createAdapter(): PersistenceAdapter {
		return new D1Adapter(this.env.DB, this.collections, {
			oplogRetention: this.oplogRetention,
		})
	}
}

/**
 * The House as the prompt packs read it, straight off D1.
 *
 * A plain read rather than a second sync client: the Article Agent needs the
 * House once per turn and holds no view of it between turns, and the tables are
 * in the D1 it is already bound to. `docs/sync.md`'s `commit()` rule is about
 * writes — this room's writer is the browser, and nothing here writes.
 */
export async function readHouse(db: D1Database): Promise<HouseContext> {
	const [lexicon, rules, tone] = await db.batch<LexiconRow | RuleRow | ToneRow>([
		db.prepare('SELECT * FROM lexicon'),
		db.prepare('SELECT * FROM rule'),
		db.prepare('SELECT * FROM tone LIMIT 1'),
	])

	return {
		tone: toHouseTone((tone.results as ToneRow[])[0]),
		lexicon: sortLexicon((lexicon.results as LexiconRow[]).map(toLexiconEntry)),
		rules: sortRules((rules.results as RuleRow[]).map(toRule)),
	}
}
