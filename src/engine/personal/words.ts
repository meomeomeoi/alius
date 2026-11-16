/** What each stake does, for either winner, in words (read by the analysis panel and the result card; keyed by the stake's `effect`). */
export const STAKE_WORDS: Record<string, { she: string; commander: string }> = {
  obedience: { she: 'the commander follows her choices for the rest of the day', commander: "she follows the commander's non-combat orders for the rest of the day" },
  slot: { she: "she books a slot of the commander's time for tomorrow", commander: "she cannot book the commander's time for a week" },
  privilege: { she: 'her standing over the commander grows', commander: 'her standing over the commander shrinks' },
  drop_demand: { she: 'her open demand is granted', commander: 'her open demand is dropped with no offence' },
  token: { she: 'she gives a token that the commander wears and cannot take off early for a week', commander: 'she gives a token now' },
  question: { she: 'she asks one question and the commander answers truthfully', commander: 'the commander asks one question and she answers truthfully' },
  mark: { she: 'the commander bears her mark for three days', commander: 'nothing, but she is stung' },
};
