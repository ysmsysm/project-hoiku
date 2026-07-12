const defaultFamilyPath = "/family";
const familyInvitePathPrefix = "/family/invite/";
const maxRedirectPathLength = 180;
const inviteTokenLength = 43;
const controlCharacterPattern = /[\u0000-\u001f\u007f]/;
const inviteTokenPattern = /^[A-Za-z0-9_-]{43}$/;

export function isSafeFamilyInviteToken(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  if (value.length !== inviteTokenLength) {
    return false;
  }

  if (controlCharacterPattern.test(value)) {
    return false;
  }

  return inviteTokenPattern.test(value);
}

export function getSafeFamilyRedirectPath(value: string | null | undefined) {
  if (!value) {
    return defaultFamilyPath;
  }

  if (
    value.length > maxRedirectPathLength ||
    controlCharacterPattern.test(value)
  ) {
    return defaultFamilyPath;
  }

  if (!value.startsWith("/") || value.startsWith("//")) {
    return defaultFamilyPath;
  }

  try {
    const decodedValue = decodeURIComponent(value);

    if (
      decodedValue.length > maxRedirectPathLength ||
      controlCharacterPattern.test(decodedValue) ||
      !decodedValue.startsWith("/") ||
      decodedValue.startsWith("//")
    ) {
      return defaultFamilyPath;
    }
  } catch {
    return defaultFamilyPath;
  }

  if (value === defaultFamilyPath) {
    return value;
  }

  if (value.startsWith(familyInvitePathPrefix)) {
    const inviteToken = value.slice(familyInvitePathPrefix.length);

    if (isSafeFamilyInviteToken(inviteToken)) {
      return value;
    }
  }

  return defaultFamilyPath;
}
