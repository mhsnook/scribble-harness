import { getSchema } from '@tiptap/core'
import UniqueID from '@tiptap/extension-unique-id'
import StarterKit from '@tiptap/starter-kit'

import { AnchoredBlocks } from './anchored'
import { BLOCK_ID_ATTR, mintBlockId, topLevelTypes } from './blocks'

/** What the document is made of. `UniqueID` is left out because it is
 * configured from this schema and only adds an attribute to it. */
const schemaExtensions = [StarterKit]

/** Every node type that can be a Block, read off the schema rather than listed. */
export const BLOCK_TYPES = topLevelTypes(getSchema(schemaExtensions))

/**
 * The Draft's editor, in one place so a test and a future server-side read
 * build the same document as the Panel does.
 */
export const draftExtensions = [
	...schemaExtensions,
	// Draws over the document without entering it — `anchored.ts`. Left out of
	// `schemaExtensions` because it adds no node, mark or attribute.
	AnchoredBlocks,
	UniqueID.configure({
		// Renders as `data-block-id`.
		attributeName: BLOCK_ID_ATTR,
		types: BLOCK_TYPES,
		generateID: mintBlockId,
	}),
]
