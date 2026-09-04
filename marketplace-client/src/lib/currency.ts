// Display-only USD estimate for non-India visitors. Checkout itself always runs in INR
// via Razorpay/UPI — this never touches the actual charge, it just shows an approximate
// USD figure next to the rupee price so international visitors aren't left guessing.
// Static rate, not a live FX call: keeps the pricing display fast and reliable rather than
// depending on a third-party rate API on every page load.
const APPROX_INR_PER_USD = 83;

function isLikelyIndianVisitor(): boolean {
  try {
    const locale = typeof navigator !== "undefined" ? navigator.language : "";
    if (locale.toLowerCase().includes("-in")) return true;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz === "Asia/Kolkata" || tz === "Asia/Calcutta";
  } catch {
    return true; // default to not showing an unnecessary USD estimate if detection fails
  }
}

/** Returns " (~$X USD)" for a non-India visitor, or "" for an India visitor. */
export function usdEstimateSuffix(inrAmount: number): string {
  if (isLikelyIndianVisitor()) return "";
  const usd = inrAmount / APPROX_INR_PER_USD;
  const formatted = usd < 1 ? usd.toFixed(2) : usd.toLocaleString("en-US", { maximumFractionDigits: 0 });
  return ` (~$${formatted} USD)`;
}
