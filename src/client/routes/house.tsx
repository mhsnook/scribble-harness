import { createFileRoute } from '@tanstack/react-router'

import { Screen } from '../components/Frame'
import { HouseScreen } from '../house/HouseScreen'
import { useHouse } from '../house/useHouse'

/** The House, at its own top-level path — `docs/house.md`. It sits beside the
 * Articles Area rather than inside an Article, because nothing in it belongs to
 * one Article. */
export const Route = createFileRoute('/house')({ component: HouseRoute })

function HouseRoute() {
	const house = useHouse()

	return (
		<Screen>
			<HouseScreen
				failure={house.failure}
				house={house.house}
				loading={house.loading}
				onAddEntry={house.addEntry}
				onAddRule={house.addRule}
				onEditEntry={house.editEntry}
				onEditRule={house.editRule}
				onMoveRule={house.moveRule}
				onRemoveEntry={house.removeEntry}
				onRemoveRule={house.removeRule}
				onRemoveSkill={house.removeSkill}
				onTone={house.setTone}
				skills={house.skills}
			/>
		</Screen>
	)
}
