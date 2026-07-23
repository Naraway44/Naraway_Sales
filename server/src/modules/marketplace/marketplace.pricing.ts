// Standard volume rate card — computed live per checkout, never published to buyers as a
// static table. Founder/Manager can still override an individual lead's price at approval
// time; that override is applied by the caller, not here.
const TIERS: { maxQuantity: number; pricePerLead: number }[] = [
  { maxQuantity: 99, pricePerLead: 10 },
  { maxQuantity: 999, pricePerLead: 5 },
  { maxQuantity: 4999, pricePerLead: 3 },
  { maxQuantity: 9999, pricePerLead: 2 },
  { maxQuantity: Infinity, pricePerLead: 1 },
];

export function priceForQuantity(quantity: number): number {
  if (quantity < 1) {
    throw new RangeError("quantity must be at least 1");
  }
  const tier = TIERS.find((t) => quantity <= t.maxQuantity)!;
  return tier.pricePerLead;
}
