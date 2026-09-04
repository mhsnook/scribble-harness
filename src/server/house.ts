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

/** The House's room — `docs/house.md`. Declaring the collections is the whole
 * server: the base class serves the socket and the write path. No `auth` hook,
 * because nothing here reads an identity — `docs/architecture.md` §4.8. */
export class House extends PartyDbServer<Env> {
	collections = houseCollections
	oplogRetention = HOUSE_OPLOG_RETENTION

	/** D1 rather than this object's own SQLite — ADR 0001. The tables are
	 * `migrations/0002_house.sql`; the adapter creates only its own `_oplog`. */
	protected createAdapter(): PersistenceAdapter {
		return new D1Adapter(this.env.DB, this.collections, {
			oplogRetention: this.oplogRetention,
		})
	}
}

/** The House as the prompt packs read it, straight off D1 rather than over a
 * second sync client — `docs/architecture.md` §4.10. */
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
