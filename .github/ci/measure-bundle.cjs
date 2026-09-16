'use strict'

// Measure the Vite build into a small JSON summary.
//
//   node measure-bundle.cjs dist /tmp/out/bundle.json
//
// This runs in the build job, next to the dist/ it reads. The report job then
// diffs two summaries, so it never needs either tree — which is what lets the
// head and base builds happen once each, in parallel, on separate runners.
//
// The build has two halves that move for different reasons, so they are
// measured on separate axes:
//
//   dist/client/   the SPA, where what matters is the eager/lazy split
//   dist/<name>/   the Worker, where what matters is the upload limit

const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

// Vite appends a content hash before the extension. Stripping it gives a stable
// key for the same logical chunk across two builds; the hashed filename is kept
// alongside, because an unchanged hash is what says a chunk is still cached.
//
// Each accepted hash length is exact, never a range. A range lets the match
// start at an earlier dash — in `a._articleId-Ci05C0Wm.js` the substring
// `_articleId-Ci05C0Wm` is itself within 8–20 characters — so the key collapses
// onto a neighbour's and two different files compare as one unchanged chunk.
// The router's code splitting puts a dash in most chunk names here, so the
// range form would be wrong on almost every one of them.
const STRIP_HASH = /[-.](?:[A-Za-z0-9_-]{8}|[A-Za-z0-9]{16}|[a-f0-9]{20})(\.[a-z0-9]+)$/

const sizeOf = (file) => {
	const buf = fs.readFileSync(file)
	return { raw: buf.length, gz: zlib.gzipSync(buf).length }
}

const add = (a, b) => ({ raw: a.raw + b.raw, gz: a.gz + b.gz })

/** Every file under a directory, recursively. Empty when the directory is absent. */
function walk(dir) {
	if (!fs.existsSync(dir)) return []
	const out = []
	for (const entry of fs.readdirSync(dir, { withFileTypes: true, recursive: true })) {
		if (entry.isFile()) out.push(path.join(entry.parentPath ?? entry.path, entry.name))
	}
	return out
}

/**
 * The client build, split by what a first paint actually pays for.
 *
 * `index.html` names the entry chunk and every modulepreload, and that set is
 * the eager cost. TanStack Router runs with `autoCodeSplitting`, so most route
 * code is behind a lazy chunk a visitor may never fetch — folding those into
 * one total would hide the number that matters and would make moving a route
 * off the eager path look like no change at all.
 */
function measureClient(clientDir) {
	const indexPath = path.join(clientDir, 'index.html')
	if (!fs.existsSync(indexPath)) {
		throw new Error(`no index.html in ${clientDir}`)
	}
	const html = fs.readFileSync(indexPath, 'utf8')
	const eager = [
		...new Set(
			[...html.matchAll(/assets\/[A-Za-z0-9._-]+\.(?:js|css)/g)].map((m) => m[0]),
		),
	]
	const isEager = new Set(eager.map((rel) => path.join(clientDir, rel)))

	const result = {
		js: { raw: 0, gz: 0 },
		css: { raw: 0, gz: 0 },
		entry: { raw: 0, gz: 0 },
		lazy: { raw: 0, gz: 0, count: 0 },
		// Every eager chunk, keyed by its hash-stripped name. Identity matters as
		// much as size: a chunk whose hash is unchanged is still in returning
		// visitors' caches.
		eagerChunks: {},
		fileCount: 0,
	}

	for (const rel of eager) {
		const one = sizeOf(path.join(clientDir, rel))
		const name = path.basename(rel)
		result.fileCount++

		if (name.endsWith('.css')) {
			// Render-blocking on first paint, so part of the eager cost — but on its
			// own axis, because it moves when design changes, not logic.
			result.css = add(result.css, one)
		} else {
			result.js = add(result.js, one)
			if (/^index[-.]/.test(name)) result.entry = one
		}
		result.eagerChunks[name.replace(STRIP_HASH, '$1')] = { file: name, ...one }
	}

	// Lazy chunks: everything else the client build emitted that a browser could
	// fetch once the router navigates there.
	for (const file of walk(clientDir)) {
		if (isEager.has(file)) continue
		if (!/\.(?:js|css)$/.test(file)) continue
		// `add` returns only raw and gz, so the count has to be carried across
		// explicitly. Assigning the result of `add` on its own drops `count` to
		// undefined and every later increment yields NaN.
		result.lazy = { ...add(result.lazy, sizeOf(file)), count: result.lazy.count + 1 }
		result.fileCount++
	}

	return result
}

/**
 * The Worker bundle, which Cloudflare size-limits on upload.
 *
 * Its directory is named after `name` in wrangler.jsonc, so it is found by
 * elimination rather than hardcoded — renaming the Worker must not silently
 * stop the measurement.
 */
function measureWorker(dist) {
	const dir = fs
		.readdirSync(dist, { withFileTypes: true })
		.filter((e) => e.isDirectory() && e.name !== 'client')
		.map((e) => path.join(dist, e.name))
		.find((d) => fs.existsSync(path.join(d, 'index.js')))

	if (!dir) return null

	let total = { raw: 0, gz: 0 }
	let count = 0
	for (const file of walk(dir)) {
		if (!file.endsWith('.js')) continue
		total = add(total, sizeOf(file))
		count++
	}
	return { name: path.basename(dir), ...total, count }
}

function measure(dist) {
	return {
		client: measureClient(path.join(dist, 'client')),
		worker: measureWorker(dist),
	}
}

module.exports = { measure, measureClient, measureWorker, walk, sizeOf, STRIP_HASH }

if (require.main === module) {
	const [dist, out] = process.argv.slice(2)
	if (!dist || !out) {
		console.error('usage: measure-bundle.cjs <dist-dir> <output.json>')
		process.exit(2)
	}
	const result = measure(dist)
	fs.mkdirSync(path.dirname(out), { recursive: true })
	fs.writeFileSync(out, JSON.stringify(result, null, 2))

	const kB = (n) => (n / 1024).toFixed(2)
	const c = result.client
	console.log(
		`${dist}: eager ${kB(c.js.gz)} kB JS + ${kB(c.css.gz)} kB CSS across ` +
			`${Object.keys(c.eagerChunks).length} chunk(s), ` +
			`${c.lazy.count} lazy chunk(s) ${kB(c.lazy.gz)} kB, ` +
			`worker ${result.worker ? kB(result.worker.gz) + ' kB' : 'not found'} (gzipped)`,
	)
}
