// Optional menu item numbers (`menuItems/{id}.itemNumber`, a whole number ≥ 1, set in
// pos-admin). Shown as "12. Chicken Chow Mein" (same in the admins and the website) and
// searchable along with the name.

type Numbered = { name: string; itemNumber?: unknown };

/** The item's number, or undefined when it has none (or the stored value isn't valid). */
export const itemNumberOf = (item: Numbered): number | undefined =>
  typeof item.itemNumber === "number" && Number.isInteger(item.itemNumber) && item.itemNumber > 0
    ? item.itemNumber
    : undefined;

/** "12. Chicken Chow Mein", or just the name when the item has no number. */
export const menuItemLabel = (item: Numbered): string => {
  const n = itemNumberOf(item);
  return n != null ? `${n}. ${item.name}` : item.name;
};

/**
 * Items whose name contains the query, or whose number starts with it ("12", "12." and
 * "#12" all find 12, 120…). An exact number match comes first; the rest keep their order.
 */
export function searchMenuItems<T extends Numbered>(items: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  const digits = /^#?\s*(\d+)\.?$/.exec(q)?.[1];
  const matches = items.filter((item) => {
    if (item.name.toLowerCase().includes(q)) return true;
    const n = itemNumberOf(item);
    return digits != null && n != null && String(n).startsWith(digits);
  });
  if (digits == null) return matches;
  const exact = Number(digits);
  return [
    ...matches.filter((item) => itemNumberOf(item) === exact),
    ...matches.filter((item) => itemNumberOf(item) !== exact),
  ];
}
