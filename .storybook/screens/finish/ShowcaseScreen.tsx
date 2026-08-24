import { Chip } from '../../../src/client/components/Chip'
import { Frame, FrameBody } from '../../../src/client/components/Frame'
import { ListRow } from '../../../src/client/components/ListRow'
import { portfolioBacklist, publishedArticles } from '../../mock/content'

/**
 * 6(b) — The public showcase. Off by default; switched on per person in
 * settings, and you choose which published pieces appear.
 */
export function ShowcaseScreen() {
	return (
		<Frame width={560}>
			<div className="flex flex-col gap-2 bg-ink px-6 py-7">
				<h1 className="font-serif text-[1.75rem] leading-tight text-paper">
					Emmy Joarness
				</h1>
				<p className="max-w-[22rem] text-13 leading-relaxed text-paper/60">
					Reported features and essays on cities, energy and the things that quietly
					stopped working. Selected work, 2024—2026.
				</p>
			</div>

			<FrameBody className="gap-5 p-4">
				<div className="grid grid-cols-2 gap-4">
					{publishedArticles.map((article) => (
						<article key={article.id} className="flex flex-col gap-2">
							<div
								aria-hidden
								className="h-14 rounded-md border border-dashed border-edge bg-hush"
							/>
							<h2 className="text-14 leading-snug font-semibold text-ink">
								{article.title}
							</h2>
							<p className="text-11 text-faint">
								{article.outlet} · {article.date} ↗
							</p>
						</article>
					))}
				</div>

				<div className="flex flex-col">
					{portfolioBacklist.map((item) => (
						<ListRow
							key={item.id}
							title={item.title}
							note={item.outlet}
							trailing={<span className="text-11 text-faint">{item.year}</span>}
						/>
					))}
				</div>

				<div className="flex items-center gap-2.5 border-t border-edge pt-3">
					<span className="text-12 text-muted">joarness.app/em</span>
					<Chip variant="accent" className="ml-auto">
						public · on
					</Chip>
				</div>
			</FrameBody>
		</Frame>
	)
}
