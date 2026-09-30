#!/usr/bin/env bash
# Collect normalised static-check output into $1.
#
# Runs once on the head tree and once on the base tree, always from that tree's
# own root. Output is one sorted line per issue, so delta.cjs can treat the two
# runs as comparable sets.
#
# NOTE: this script ends by restoring the tree with `git checkout -- .`. That is
# correct in CI, where the checkout is clean. Run it against a working tree with
# uncommitted edits and it discards them.

# Deliberately no `-e`: every check here exits non-zero when it finds issues,
# which is the normal case, not a script failure.
set -uo pipefail

OUT="${1:?usage: collect-static.sh <output-dir>}"
mkdir -p "$OUT"

# Byte-order sorting, so the two trees produce comparable lists even if the two
# runners ever differ in locale. `sort` under a UTF-8 locale ignores leading
# punctuation, which would order `.oxfmtrc.json` after `AGENTS.md`.
export LC_ALL=C

# Paths kept out of the lint and formatter deltas: build output, and the
# vendored skills under .claude and .agents. Both produce noise nobody on the PR
# can act on.
#
# `.oxlintrc.json` and `.oxfmtrc.json` ignore most of these too. It is repeated
# here because each tree is measured with its OWN config until the base job
# checks the configs out from head, so a PR that edits either config would
# otherwise move its own baseline.
#
# `worker-configuration.d.ts` is written by `wrangler types` on postinstall and
# is gitignored, so it never reaches `git diff`; it is listed because oxlint
# still reads it off disk.
EXCLUDE='^(dist/|storybook-static/|\.wrangler/|\.claude/|\.agents/|src/client/routeTree\.gen\.ts$|worker-configuration\.d\.ts$)'

# No separate code-generation step here. `pnpm install` runs `wrangler types` on
# postinstall, which writes the gitignored `worker-configuration.d.ts` that both
# the typecheck and the Worker tests read. That is why the workflow guards every
# check on the install having succeeded.

# Read-only checks run concurrently. The typechecker is the long pole and oxlint
# finishes well underneath it, so the lint is close to free.
(
	# The tools, not `pnpm typecheck`. This script is fetched from head and run
	# against BOTH trees, and the base tree is the base branch — on the PR that
	# introduces or renames a script, base has no such script and the check
	# silently measures nothing. Spelling the commands out keeps the two trees
	# comparable.
	#
	# This pair is what `pnpm typecheck` runs. Capture the whole thing first, so
	# the status is the compound command's own rather than grep's.
	raw=$(pnpm exec wrangler types --check 2>&1 && pnpm exec tsc --build 2>&1)
	status=$?
	printf '%s\n' "$raw" | grep ': error TS' | sort >"$OUT/typecheck.txt"

	# The first half of that compound command fails in wrangler's own format,
	# which prints nothing the grep matches. An empty file reads as zero type
	# errors, so a drifted `worker-configuration.d.ts` would merge clean. Record
	# the non-zero exit as one synthetic issue instead.
	if [ "$status" -ne 0 ] && [ ! -s "$OUT/typecheck.txt" ]; then
		echo "typecheck(0,0): error TS0000: the typecheck exited $status with no TS diagnostic — see the job log" \
			>"$OUT/typecheck.txt"
	fi
) &
(
	# oxlint's unix format is `file:line:col: message [rule]`, which delta.cjs
	# parses directly. A second linter would write another raw file here and join
	# the same `cat`, merging into one sorted list.
	pnpm exec oxlint . -f unix >"$OUT/.oxlint.raw" 2>&1
	grep -E '^[^:[:space:]][^:]*:[0-9]+:[0-9]+:' "$OUT/.oxlint.raw" |
		grep -Ev "$EXCLUDE" |
		sort -u >"$OUT/lint.txt"
) &
wait

# The formatter REWRITES files, so it runs after the read-only checks. The set
# of files it modified is exactly the formatting debt — no separate `--check`
# pass is needed, and `git diff --name-only` gives repo-root-relative paths with
# no `./`, the same shape as the `touched.txt` the head job writes. Restore the
# tree afterwards, or every later step in the job sees a dirty checkout.
pnpm exec oxfmt . >/dev/null 2>&1
git diff --name-only | grep -Ev "$EXCLUDE" | sort >"$OUT/format.txt"
git checkout -- .

# Never let a missing file break the render step.
#
# `touched.txt` is deliberately NOT in this list. The workflow writes it into
# the same directory on the head tree only, and the formatter gate reads its
# ABSENCE as "the step that lists this PR's files did not run" — an empty file
# here would turn that failure into a silent pass.
for f in typecheck lint format; do
	[ -f "$OUT/$f.txt" ] || : >"$OUT/$f.txt"
done

rm -f "$OUT/.oxlint.raw"
wc -l "$OUT"/*.txt
