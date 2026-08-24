import { Button } from '../../../src/client/components/Button'
import { Chip } from '../../../src/client/components/Chip'
import { Frame, FrameBody } from '../../../src/client/components/Frame'
import { MetaLabel } from '../../../src/client/components/MetaLabel'
import { Panel } from '../../../src/client/components/Panel'
import { BackButton, TitleBar } from '../../../src/client/components/TitleBar'
import { ARTICLE_TITLE } from '../../mock/content'

/**
 * 5(a) — Finish, not "export". The last steps might include a review, or
 * twenty-five candidate titles — this is the start of a checkout process, not
 * the end of the piece.
 */
export function FinishScreen() {
	return (
		<Frame width={560}>
			{/* The Article screen has no route yet, so this goes nowhere. */}
			<TitleBar back={<BackButton>{ARTICLE_TITLE}</BackButton>} title="Finish" />
			<FrameBody>
				<Panel className="gap-4 p-4">
					<div className="flex items-center gap-2">
						<Chip variant="solid" interactive>
							markdown
						</Chip>
						<Chip variant="outline" interactive>
							html
						</Chip>
						<Chip variant="outline" interactive>
							docx
						</Chip>
						<span className="ml-1 text-12 text-faint">footnotes included</span>
					</div>

					<section className="flex flex-col gap-2">
						<MetaLabel>House style — footnote template</MetaLabel>
						<div className="flex flex-col gap-2 rounded-md border border-edge bg-sunk p-2.5">
							<div className="flex flex-wrap items-center gap-1.5">
								<Chip variant="default">author</Chip>
								<span className="text-12 text-muted">,</span>
								<Chip variant="default">title</Chip>
								<span className="text-12 text-muted">,</span>
								<Chip variant="default">publication</Chip>
								<span className="text-12 text-muted">(</span>
								<Chip variant="default">date</Chip>
								<span className="text-12 text-muted">),</span>
								<Chip variant="default">url</Chip>
							</div>
							<p className="text-11 text-faint">
								Drag the fields into order; type literal text between them.
							</p>
						</div>
					</section>

					<section className="flex flex-col gap-2">
						<MetaLabel>Preview</MetaLabel>
						<ol className="flex flex-col gap-1.5 text-12 leading-relaxed text-muted">
							<li>
								1. R. Okonkwo, “Permit throughput in six mid-sized cities”, the Quarterly
								(2023), quarterly.example/permit-throughput
							</li>
							<li>
								2. A. Weill, “Zoning and the missing middle”, Field Notes (2019),
								fieldnotes.example/missing-middle
							</li>
						</ol>
					</section>

					<div className="flex flex-wrap gap-2">
						<Button>download</Button>
						<Button>copy</Button>
						<Button variant="accent">mark as sent →</Button>
					</div>

					<div className="flex items-center gap-3 rounded-md border border-edge bg-sunk p-2.5">
						<div className="flex min-w-0 flex-1 flex-col gap-1.5">
							<MetaLabel>Remind me to chase it</MetaLabel>
							<div className="flex flex-wrap gap-1.5">
								<Chip variant="outline" interactive>
									3 days
								</Chip>
								<Chip variant="default" interactive>
									1 week
								</Chip>
								<Chip variant="outline" interactive>
									2 weeks
								</Chip>
								<Chip variant="outline" interactive>
									a date…
								</Chip>
							</div>
						</div>
						<Button size="sm">set</Button>
					</div>
				</Panel>
			</FrameBody>
		</Frame>
	)
}
