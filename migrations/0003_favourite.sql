-- The House's favourites — docs/house.md. A publication, a person, or an idea
-- the writer wants research to rank first among results of equal merit.
--
-- `prefer_for` is JSON text of string[], like `tone.adjectives`. `why` and
-- `not_for` are null where the writer says nothing.
CREATE TABLE favourite (
	id TEXT PRIMARY KEY,
	type TEXT NOT NULL,
	name TEXT NOT NULL,
	why TEXT,
	prefer_for TEXT NOT NULL,
	not_for TEXT,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL
);

-- One favourite per name within a type. NOCASE, because the writer does not
-- hold a publication's capitalisation, and the ranking reads two rows for one
-- name as two options Clef must choose between.
CREATE UNIQUE INDEX favourite_one_per_name ON favourite (type, name COLLATE NOCASE);
