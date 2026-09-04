import { Frame } from '../../../src/client/components/Frame'
import { HouseScreen as LiveHouseScreen } from '../../../src/client/house/HouseScreen'
import { houseContext, houseSkills } from '../../mock/content'

/**
 * 1(d) — the House. `HouseScreen` is the live component: `/house` renders the
 * same one against the room's own rows.
 *
 * Every action is a no-op here. The screen is a read of four collections and a
 * write per edit, and what a story is for is the reading.
 */
export function HouseScreen() {
	const noop = () => undefined

	return (
		<Frame minHeight={560} width={1000}>
			<LiveHouseScreen
				house={houseContext}
				onAddEntry={noop}
				onAddRule={noop}
				onEditEntry={noop}
				onEditRule={noop}
				onMoveRule={noop}
				onRemoveEntry={noop}
				onRemoveRule={noop}
				onRemoveSkill={noop}
				onTone={noop}
				skills={houseSkills}
			/>
		</Frame>
	)
}
