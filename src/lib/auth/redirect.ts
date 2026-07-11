const defaultFamilyPath = "/family";

export function getSafeFamilyRedirectPath(value: string | null | undefined) {
  if (!value) {
    return defaultFamilyPath;
  }

  if (!value.startsWith("/") || value.startsWith("//")) {
    return defaultFamilyPath;
  }

  try {
    const decodedValue = decodeURIComponent(value);

    if (decodedValue.startsWith("//")) {
      return defaultFamilyPath;
    }
  } catch {
    return defaultFamilyPath;
  }

  return value;
}
