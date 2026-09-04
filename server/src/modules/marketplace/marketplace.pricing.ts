// Standard volume rate card — computed live per checkout, never published to buyers as a
// static table. Founder/Manager can still override an individual lead's price at approval
// time; that override is applied by the caller, not here.
// Launch pricing, deliberately set at the commodity end of the market to seed the first
// buyers: IndiaMART's Maximiser works out to ~₹24/lead (shared with 4-5 suppliers), and
// EasyLeadz's entry plan to ~₹80/lead for a bare contact row. ₹20 undercuts both.
//
// This is priced as data, not as qualified intent. Once there are buyers with results to
// point at, the exclusivity and the intent signal support materially more — the honest
// comparison is ~₹340 per exclusive conversation actually had on IndiaMART.
const TIERS: { maxQuantity: number; pricePerLead: number }[] = [
  { maxQuantity: 24, pricePerLead: 40 },
  { maxQuantity: 99, pricePerLead: 30 },
  { maxQuantity: 499, pricePerLead: 25 },
  { maxQuantity: 1999, pricePerLead: 20 },
  { maxQuantity: Infinity, pricePerLead: 15 },
];

export function priceForQuantity(quantity: number): number {
  if (quantity < 1) {
    throw new RangeError("quantity must be at least 1");
  }
  const tier = TIERS.find((t) => quantity <= t.maxQuantity)!;
  return tier.pricePerLead;
}
