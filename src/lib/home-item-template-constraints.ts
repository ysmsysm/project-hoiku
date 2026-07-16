export const homeItemQuantityMin = 0;
export const homeItemQuantityMax = 5;
export const homeRoughUnitMaxLength = 10;
export const homeUnitLineLength = 5;

export function assertValidHomeItemQuantity(value: unknown) {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < homeItemQuantityMin ||
    value > homeItemQuantityMax
  ) {
    throw new Error("invalid_home_item_quantity");
  }
}

export function assertValidHomeRoughUnit(value: unknown) {
  if (
    typeof value !== "string" ||
    Array.from(value).length > homeRoughUnitMaxLength
  ) {
    throw new Error("invalid_home_rough_unit");
  }
}

export function splitHomeItemUnitLines(unit: string) {
  const characters = Array.from(unit);
  const lines: string[] = [];

  for (let index = 0; index < characters.length; index += homeUnitLineLength) {
    lines.push(characters.slice(index, index + homeUnitLineLength).join(""));
  }

  return lines.length > 0 ? lines : [""];
}
