import { type DynamicToolUIPart, getToolName, type ToolUIPart } from 'ai'

import {
	type RecordedOffers,
	recordedOffersOutput,
	recordOffersTool,
} from '../../shared/chat'

/**
 * Reading a research turn's result out of the transcript. `recordOffers`
 * resolves server-side and hands back ids, not rows — §5.
 */

/** What one `recordOffers` call turned up, or null for a part that is not one. */
export function readRecordedOffers(
	part: ToolUIPart | DynamicToolUIPart,
): RecordedOffers | null {
	if (getToolName(part) !== recordOffersTool) return null
	if (part.state !== 'output-available') return null

	const parsed = recordedOffersOutput.safeParse(part.output)

	return parsed.success ? parsed.data : null
}
