export const spotQuantityMin = 1;
export const spotQuantityMax = 99;

export const clampSpotQuantity = (value: number) => {
  if (!Number.isFinite(value)) {
    return spotQuantityMin;
  }

  return Math.min(spotQuantityMax, Math.max(spotQuantityMin, Math.floor(value)));
};

export const parseSpotQuantityInput = (value: string) => {
  if (!/^\d*$/.test(value)) {
    return null;
  }

  if (value === "") {
    return spotQuantityMin;
  }

  return clampSpotQuantity(Number(value));
};

export const getSpotQuantityLabel = (count: number) =>
  count > 1 ? ` ×${count}` : "";

export const formatSpotItemName = (name: string, count: number) =>
  `${name}${getSpotQuantityLabel(count)}`;
