import { Button } from '../../../src/client/components/Button'
import { GroupHeading } from '../../../src/client/components/Divider'
import { Field } from '../../../src/client/components/Field'
import { Frame, FrameBody } from '../../../src/client/components/Frame'
import { MetaLabel } from '../../../src/client/components/MetaLabel'
import { BackLink, TitleBar } from '../../../src/client/components/TitleBar'
import { publishedArticles } from '../../mock/content'

/**
 * 6(a) — Submitted → published. Marking a piece published asks for the text as
 * it actually ran, which is what feeds the comparison underneath.
 */
export function ArchiveScreen() {
	return (
		<Frame width={520}>
			<TitleBar
				back={<BackLink to="/">Articles</BackLink>}
				title="Submitted & published"
				actions={<span className="text-12 text-faint">9 published</span>}
			/>
			<FrameBody className="gap-4 p-4">
				<section className="flex flex-col gap-2.5">
					<GroupHeading count={2}>Submitted</GroupHeading>
					<div className="flex flex-col gap-2.5 rounded-lg border border-edge p-3">
						<div className="flex items-baseline gap-2.5">
							<h3 className="text-14 font-semibold text-ink">
								Why Cities Stopped Building
							</h3>
							<span className="text-11 text-faint">
								sent 12 jul · chase due in 2 days
							</span>
						</div>
						<div className="flex items-center gap-2.5">
							<Button variant="accent" size="sm">
								mark published
							</Button>
							<Field size="sm" placeholder="where it ran (url)" className="flex-1" />
						</div>
						<p className="text-11 leading-relaxed text-faint">
							Marking it published asks for the text as it ran, which is what the
							comparison below reads from.
						</p>
					</div>
				</section>

				<section className="flex flex-col gap-2.5">
					<GroupHeading count={9}>Published</GroupHeading>
					<div className="grid grid-cols-2 gap-2.5">
						{publishedArticles.map((article) => (
							<article
								key={article.id}
								className="flex flex-col gap-1.5 rounded-lg border border-edge p-3"
							>
								<div
									aria-hidden
									className="h-11 rounded-md border border-dashed border-edge bg-hush"
								/>
								<h3 className="text-13 leading-snug font-semibold text-ink">
									{article.title}
								</h3>
								<p className="text-11 text-faint">
									{article.outlet} · {article.date} ↗
								</p>
							</article>
						))}
					</div>
				</section>

				<section className="flex flex-col gap-2.5 rounded-lg border border-edge bg-sunk p-3">
					<div className="flex items-baseline gap-2.5">
						<h3 className="text-14 font-semibold text-ink">
							Self-edit final vs published
						</h3>
						<span className="text-11 text-faint">stub</span>
					</div>
					<div className="grid grid-cols-2 gap-3">
						<div className="flex flex-col gap-1.5">
							<MetaLabel>Mine</MetaLabel>
							<p className="text-12 leading-relaxed text-muted">
								“Nobody voted to stop building. It happened one reasonable amendment at a
								time.”
							</p>
						</div>
						<div className="flex flex-col gap-1.5">
							<MetaLabel>As published</MetaLabel>
							<p className="text-12 leading-relaxed text-muted">
								“Nobody voted to stop building.{' '}
								<mark className="bg-accent text-accent-ink">
									It happened by increments.
								</mark>
								”
							</p>
						</div>
					</div>
				</section>
			</FrameBody>
		</Frame>
	)
}
