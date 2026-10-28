import type { Collection } from '@tanstack/db'
import { createPartyDb, partyTransport } from 'party-db/client'

import {
	HOUSE_ROOM,
	houseCollections,
	type LexiconRow,
	type RuleRow,
	type SkillRow,
	type ToneRow,
} from '../../shared/house'

/**
 * The House's party-db connection — one room for the whole Team, so one client
 * for the whole session. `lib/sync.ts` keys the Article's clients by Article
 * and closes an idle one; there is only ever one House, and the Notes Panel
 * reads its Skills from inside an Article, so this one stays open.
 */

export type HouseSync = {
	lexicon: Collection<LexiconRow>
	rule: Collection<RuleRow>
	skill: Collection<SkillRow>
	tone: Collection<ToneRow>
}

let held: HouseSync | undefined

/** A lookup, not a connect, so it is safe in render. The socket opens on the
 * first call and stays open. */
export function houseSync(): HouseSync {
	if (held !== undefined) return held

	const transport = partyTransport({
		host: window.location.host,
		party: 'house',
		room: HOUSE_ROOM,
	})
	const { db } = createPartyDb(transport, houseCollections)

	held = {
		lexicon: db.lexicon as Collection<LexiconRow>,
		rule: db.rule as Collection<RuleRow>,
		skill: db.skill as Collection<SkillRow>,
		tone: db.tone as Collection<ToneRow>,
	}

	return held
}
