/**
 * One frame on the Article Agent's multiplexed socket is ours: a refused Plan
 * write. Everything else is the Agents SDK's own control traffic.
 */

/** Narrows an unknown frame to the one named. The caller states the frame type,
 * because only the caller knows what `type` implies about the rest. */
export function isFrame<F extends { type: string }>(
	frame: unknown,
	type: F['type'],
): frame is F {
	return (
		typeof frame === 'object' &&
		frame !== null &&
		(frame as { type?: unknown }).type === type
	)
}
