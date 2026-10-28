# Research is ranked by a decision model, and Favourites rank only among equals

Status: proposed

The Chat searched one query at a time and read every result it got back — six a search,
in the order Exa returned them. The writer wanted more ground covered per call, the best of
it shown, and their own Favourites put first. `llm.md` gives the mechanics. This records the
choices that are not obvious from the code, and the ones that were rejected.

## A decision model ranks, and the language model still writes the Offer

Clef answers typed questions with calibrated probabilities and writes no text. That makes
it cheap, fast, and unable to invent a field, and it also means it cannot write an Offer's
note or trim a Quote back to a whole sentence.

**Rejected: record Clef's picks as Offers directly.** It would save the model a step, but
the Offer would arrive without the note saying where it came from, and with an excerpt cut
mid-sentence. Clef narrows what the language model reads, and the language model still
writes every Offer.

## Merit is judged without the Favourites in view

The 1(f) mockup says a Favourite goes "ahead of equally relevant results, never instead of
better ones". A ranking that let a Favourite raise its own merit would break the second
half of that.

**Rejected: describe the Favourites in the merit question.** One question is cheaper. But a
calibrated model told the writer trusts a publication will score that publication's result
higher, and the merit score is what keeps a better result ahead. So `merit` sees only the
Article, the queries, and the result. A separate `favourite` question asks which Favourite,
if any, the result belongs to, and the pick reads it only to order results within one merit
tier.

**Rejected: put the Favourites in the Chat's prompt pack.** The Chat would aim its queries at
them, and a query aimed at a Favourite skews the pool toward that Favourite's pages before
anything judges merit — a filter by another route. So the Favourites are not in
`HouseContext`, and reach the ranking alone.

## One Clef call per candidate

**Rejected: one call holding the whole pool.** Clef takes up to 64 questions against one
state, so twenty candidates fit one call, which is fewer requests and one copy of the Plan
rather than twenty. But each candidate's score would then be read against whichever others
came back with it, and a calibrated probability that depends on its neighbours is not
calibrated. One call per candidate costs ≈20 requests and repeats the Plan's titles and
intents, which is about half a cent.

## The ranking fails soft, and as a whole

If any Clef call fails, the turn gets the pool unranked rather than a ranking with holes in
it. A partly ranked pool would have to place the unjudged results somewhere, and every place
is a guess. Unranked is the behaviour the Chat had before Clef, so a failure costs the
ranking and nothing else.

## Consequences

- **Two models run on the `env.AI` binding.** `llm.md` no longer says one model serves
  every call; it says one language model does.
- **Nothing here has met the real Clef.** The tests script it, and no Cloudflare credentials
  were available when this was written. The request shape follows Cloudflare's model
  catalogue and a third-party write-up from launch, and `decide.ts` validates the answer
  rather than trusting it. The first live turn either ranks or logs why it did not.
- **The thresholds are guesses.** A merit floor of 1.5 and a Favourite floor of 0.5 are where
  the scale's own wording puts them, not values tuned against the writer's own rulings.
  Accepted and Declined Offers are the labelled data that would tune them.
