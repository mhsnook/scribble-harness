'use strict'

// Diff two bundle measurements and render one fragment.
//
// Takes the JSON summaries written by measure-bundle.cjs, not the built
// directories — the report job never has either tree checked out.

const fs = require('fs')
const path = require('path')
const { formatBytes, deltaLabel, sizeTable, trend } = require('./delta.cjs')

const load = (p) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null)

// Two builds of the same commit differ by a few bytes per chunk. Below this,
// call it unchanged rather than teaching people that the number is noise.
const NOISE_FLOOR = 512

// Cloudflare refuses a Worker whose gzipped bundle is over this. 3 MiB is the
// free-plan limit and the tighter of the two; the paid limit is 10 MiB. Report
// the number as a share of the budget rather than as a trend, because what
// matters is the distance to a hard rejection at deploy time.
const WORKER_LIMIT = 3 * 1024 * 1024

/**
 * Compare eager chunks by identity, not size.
 *
 * This is the axis people miss. A chunk whose content hash is unchanged is
 * still in returning visitors' caches. A PR that adds 2 kB to one has really
 * cost every returning visitor the WHOLE chunk again, which may be 200 kB. So
 * report which chunks changed first, and their sizes second.
 */
function chunkSection(base, head) {
	const names = [
		...new Set([...Object.keys(base.eagerChunks), ...Object.keys(head.eagerChunks)]),
	].sort()
	if (!names.length) return '_No chunks in the eager set._'

	const changed = []
	let cachedRaw = 0
	let cachedGz = 0
	let cachedCount = 0

	for (const n of names) {
		const b = base.eagerChunks[n]
		const h = head.eagerChunks[n]
		if (b && h && b.file === h.file) {
			cachedCount++
			cachedRaw += h.raw
			cachedGz += h.gz
		} else {
			changed.push({ n, b, h })
		}
	}

	if (!changed.length) {
		return (
			`✅ **Every eager chunk keeps its hash** — ${cachedCount} chunk(s) totalling ` +
			`${formatBytes(cachedRaw)} raw (${formatBytes(cachedGz)} gzipped), still cached for repeat visitors.`
		)
	}

	const rows = changed.map(({ n, b, h }) => {
		if (!b)
			return `- 🆕 \`${n}\` added — ${formatBytes(h.raw)} raw (${formatBytes(h.gz)} gz)`
		if (!h) return `- ❌ \`${n}\` removed — was ${formatBytes(b.raw)} raw`
		// deltaLabel supplies the direction emoji: a chunk that shrank must not
		// render as growth.
		return `- \`${n}\` — ${formatBytes(b.raw)} → ${formatBytes(h.raw)} raw, ${deltaLabel(h.raw, b.raw)}`
	})
	const stable = cachedCount
		? `\n\n${cachedCount} other chunk(s) keep their hash — ${formatBytes(cachedRaw)} raw (${formatBytes(cachedGz)} gz), still cached.`
		: ''
	return `**Chunks that changed — repeat visitors re-download these in full:**\n${rows.join('\n')}${stable}`
}

/**
 * The Worker half, on its own axis.
 *
 * The client bundle is a download cost and the Worker bundle is an upload
 * limit, so a combined total would say nothing about either. A percentage of
 * the limit is the useful framing here: the failure mode is a deploy Cloudflare
 * refuses, not a page that loads slowly.
 */
function workerSection(base, head) {
	if (!head && !base) return '_No Worker bundle found in either build._'
	if (!head) return '⚠️ The PR build emitted no Worker bundle, though the base build did.'
	if (!base)
		return `🆕 Worker bundle \`${head.name}\` — ${formatBytes(head.gz)} gzipped (new).`

	const share = ((head.gz / WORKER_LIMIT) * 100).toFixed(1)
	return (
		`**Worker \`${head.name}\`** — ${head.count} file(s), ` +
		`${formatBytes(head.raw)} raw, **${formatBytes(head.gz)} gzipped** · ` +
		`${deltaLabel(head.gz, base.gz)}\n\n` +
		`${trend(head.gz, base.gz)} ${share}% of Cloudflare's 3 MiB gzipped upload limit on the free plan (10 MiB on paid).`
	)
}

module.exports = function render({ head, base, out }) {
	fs.mkdirSync(out, { recursive: true })
	const h = load(head)
	const b = load(base)

	// A missing measurement means a build failed. Say so rather than rendering a
	// delta against zeros, which would read as "the whole bundle is new".
	//
	// An EMPTY measurement is the same failure wearing a disguise: a build that
	// exits zero and writes nothing would otherwise report a triumphant −100%.
	const empty = (m) => !m || !m.client || !m.client.fileCount
	if (empty(h) || empty(b)) {
		const which =
			empty(h) && empty(b)
				? 'Neither build produced a measurable bundle'
				: empty(h)
					? 'The PR build produced no measurable bundle'
					: 'The base build produced no measurable bundle'
		fs.writeFileSync(
			path.join(out, '40-bundle.md'),
			`#### Bundle size\n\n⚠️ ${which}, so there is nothing to compare. Check the job log.`,
		)
		fs.writeFileSync(
			path.join(out, '40-bundle.json'),
			JSON.stringify({ check: 'bundle', missing: true }, null, 2),
		)
		return
	}

	const hc = h.client
	const bc = b.client

	const markdown = [
		'#### Bundle size',
		'',
		'**Eager load** — the entry chunk plus every modulepreload in `index.html` (what a first paint downloads)',
		'',
		sizeTable(hc.js.raw, hc.js.gz, bc.js.raw, bc.js.gz),
		'',
		'**Entry chunk** — your own code, re-downloaded on every deploy',
		'',
		sizeTable(hc.entry.raw, hc.entry.gz, bc.entry.raw, bc.entry.gz),
		'',
		'**CSS** — render-blocking on first paint',
		'',
		sizeTable(hc.css.raw, hc.css.gz, bc.css.raw, bc.css.gz),
		'',
		`**Lazy chunks** — ${hc.lazy.count} file(s) (base: ${bc.lazy.count}), ${formatBytes(hc.lazy.gz)} gzipped · ` +
			`${deltaLabel(hc.lazy.gz, bc.lazy.gz)}. The router code-splits routes out of the eager set, so growth here ` +
			'alongside a flat eager total is the shape a new route should have.',
		'',
		chunkSection(bc, hc),
		'',
		workerSection(b.worker, h.worker),
	].join('\n')

	// Below the noise floor, report the eager delta as zero. Two builds of the
	// same commit differ by a few bytes, and a budget that trips on those
	// teaches people the number means nothing.
	const gzDelta = hc.js.gz - bc.js.gz
	fs.writeFileSync(path.join(out, '40-bundle.md'), markdown)
	fs.writeFileSync(
		path.join(out, '40-bundle.json'),
		JSON.stringify(
			{
				check: 'bundle',
				eagerRawDelta: hc.js.raw - bc.js.raw,
				eagerGzDelta: Math.abs(gzDelta) < NOISE_FLOOR ? 0 : gzDelta,
				eagerGzBase: bc.js.gz,
				entryGzDelta: hc.entry.gz - bc.entry.gz,
				lazyGzDelta: hc.lazy.gz - bc.lazy.gz,
				workerGz: h.worker ? h.worker.gz : null,
				workerGzDelta: h.worker && b.worker ? h.worker.gz - b.worker.gz : null,
			},
			null,
			2,
		),
	)
}

module.exports.chunkSection = chunkSection
module.exports.workerSection = workerSection
module.exports.NOISE_FLOOR = NOISE_FLOOR
module.exports.WORKER_LIMIT = WORKER_LIMIT
