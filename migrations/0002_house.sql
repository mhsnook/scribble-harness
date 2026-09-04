-- The House — docs/house.md. One party-db room over these tables, so party-db
-- CRUDs them and never creates them: its D1 adapter brings only its own _oplog.

-- A named term with the writer's definition of it. `provenance` is JSON because
-- it is the same two-field record a Reference carries, and only the client
-- reads inside it.
CREATE TABLE lexicon (
	id TEXT PRIMARY KEY,
	term TEXT NOT NULL,
	definition TEXT NOT NULL,
	provenance TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL
);

-- One entry per term. NOCASE, because the writer looking a term up does not
-- hold its capitalisation, and two entries for one term would both reach the
-- prompt.
CREATE UNIQUE INDEX lexicon_one_per_term ON lexicon (term COLLATE NOCASE);

-- One standing rule. `ord` is a fractional index the writer's reordering
-- assigns, so moving one rule writes one row.
CREATE TABLE rule (
	id TEXT PRIMARY KEY,
	ord REAL NOT NULL,
	body TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL
);

CREATE INDEX rule_by_ord ON rule (ord);

-- A saved review prompt, picked from the Review composer.
CREATE TABLE skill (
	id TEXT PRIMARY KEY,
	name TEXT NOT NULL,
	prompt TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL
);

-- Saving under a name that is taken replaces that Skill, which the client does
-- by writing the row this index made it find.
CREATE UNIQUE INDEX skill_one_per_name ON skill (name COLLATE NOCASE);

-- The House's own Voice and Adjectives, as the outermost Scope. Exactly one
-- row, under the id 'house': a Voice is a single value and the Adjectives are a
-- list, so a row of two columns states the Scope where a row per term could
-- not.
CREATE TABLE tone (
	id TEXT PRIMARY KEY,
	voice TEXT,
	adjectives TEXT NOT NULL
);
