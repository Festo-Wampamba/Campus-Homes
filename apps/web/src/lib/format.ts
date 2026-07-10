const ugx = new Intl.NumberFormat("en-UG", { maximumFractionDigits: 0 });

export function formatUgx(amount: number): string {
  return `UGX ${ugx.format(amount)}`;
}

// amenity keys are snake_case in the jsonb ("water_supply" → "Water supply")
export function humanizeKey(key: string): string {
  const words = key.replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
