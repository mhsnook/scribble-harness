#!/usr/bin/env bash
# Check 6: scan the built output for code that must never ship.
#
#   bash scan-build.sh dist [fragment-dir]
#
# With a fragment directory, the scan writes `60-scan.md` and `60-scan.json`
# into it, so a leak appears in the PR comment beside every other check rather
# than only as a red job nobody opens.
#
# Runs over the SAME dist/ the bundle measurement just read — never build twice
# for two questions about one artifact. It is pointed at `dist`, not
# `dist/client`, so it covers the Worker bundle as well as the SPA: a leaked
# credential name is likelier on the server half.
#
# Head branch only: there is nothing to diff, a string either leaked or it did
# not.
#
# Keep the reason on each entry. A bare regex list rots within months, and
# nobody dares delete an entry they cannot explain.

set -uo pipefail

DIST="${1:?usage: scan-build.sh <build-output-dir> [fragment-dir]}"
FRAGMENTS="${2:-}"

# One entry per forbidden pattern, as "regex<TAB>why it must not ship".
#
# Literal strings, not identifiers: minification renames `isDebugging` to `a`
# but leaves a string literal and the `debugger` keyword alone.
FORBIDDEN=(
	'(^|[^A-Za-z0-9_$.])debugger([^A-Za-z0-9_$]|$)	a debugger statement, which halts the browser on any visitor with devtools open'
	'\.dev\.vars	a reference to the local secrets file, which is never deployed and so is never there at runtime'
	'(CLOUDFLARE|CF)_API_TOKEN	a Cloudflare credential name, which belongs in the deploy environment rather than in the build'
)

# Write the fragment and stop, when there is nothing to scan. A missing or empty
# build directory is a crashed build, not a clean one, and `missing: true` is
# what makes gate.cjs say so instead of passing on an absent sidecar.
report_missing() {
	echo "$1" >&2
	if [ -n "$FRAGMENTS" ]; then
		mkdir -p "$FRAGMENTS"
		printf '#### Build content scan\n\n⚠️ %s, so nothing was scanned. Check the job log.\n' "$1" \
			>"$FRAGMENTS/60-scan.md"
		printf '{\n\t"check": "scan",\n\t"found": 0,\n\t"checked": %d,\n\t"missing": true\n}\n' \
			"${#FORBIDDEN[@]}" >"$FRAGMENTS/60-scan.json"
	fi
	exit 0
}

[ -d "$DIST" ] || report_missing "no such directory: $DIST"

# Source maps legitimately contain original source, so scanning them produces
# hits that mean nothing.
#
# `mapfile` rather than word splitting, so a path containing a space is one
# entry rather than two nonexistent ones.
mapfile -t FILES < <(find "$DIST" -type f \( -name '*.js' -o -name '*.css' -o -name '*.html' \) ! -name '*.map')
[ "${#FILES[@]}" -gt 0 ] || report_missing "no scannable files in $DIST"

found=0
report=()
for entry in "${FORBIDDEN[@]}"; do
	pattern="${entry%%	*}"
	reason="${entry#*	}"
	hits=$(grep -rlE "$pattern" "${FILES[@]}" 2>/dev/null || true)
	if [ -n "$hits" ]; then
		# `::error::` puts the reason on the run summary, where a contributor sees
		# it without reading the log.
		echo "::error::$reason"
		echo "   pattern: $pattern"
		echo "$hits" | sed 's|^|   |'
		report+=("- ❌ **$reason** — \`$pattern\`")
		while IFS= read -r hit; do report+=("  - \`$hit\`"); done <<<"$hits"
		found=$((found + 1))
	fi
done

if [ -n "$FRAGMENTS" ]; then
	mkdir -p "$FRAGMENTS"
	{
		echo "#### Build content scan"
		echo
		if [ "$found" -gt 0 ]; then
			echo "❌ **$found forbidden pattern(s) reached the build output.**"
			echo
			printf '%s\n' "${report[@]}"
		else
			echo "✅ Build output clean — ${#FORBIDDEN[@]} pattern(s) checked across ${#FILES[@]} file(s)."
		fi
	} >"$FRAGMENTS/60-scan.md"
	printf '{\n\t"check": "scan",\n\t"found": %d,\n\t"checked": %d\n}\n' \
		"$found" "${#FORBIDDEN[@]}" >"$FRAGMENTS/60-scan.json"
fi

if [ "$found" -gt 0 ]; then
	echo
	echo "$found forbidden pattern(s) reached the production build."
	exit 1
fi

echo "✅ build output clean — ${#FORBIDDEN[@]} pattern(s) checked across ${#FILES[@]} file(s)"
