import { useCallback, useMemo, useRef, useState } from "react";

export type EditMode = "view" | "edit";

type UseEditableSectionOptions<T> = {
  initialValue: T;
  validate: (value: T) => string | null;
  isEqual?: (savedValue: T, draftValue: T) => boolean;
  onSave: (value: T) => void | Promise<void>;
};

export type EditableSectionState<T> = {
  mode: EditMode;
  savedValue: T;
  draftValue: T;
  isDirty: boolean;
  isValid: boolean;
  isSaving: boolean;
  error: string | null;
  validationError: string | null;
};

export function useEditableSection<T>({
  initialValue,
  validate,
  isEqual = Object.is,
  onSave,
}: UseEditableSectionOptions<T>) {
  const [mode, setMode] = useState<EditMode>("view");
  const [savedValue, setSavedValue] = useState(initialValue);
  const [draftValue, setDraftValue] = useState(initialValue);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saveInFlightRef = useRef(false);

  const validationError = useMemo(
    () => validate(draftValue),
    [draftValue, validate],
  );
  const isDirty = !isEqual(savedValue, draftValue);
  const isValid = validationError === null;

  const startEdit = useCallback(() => {
    setDraftValue(savedValue);
    setError(null);
    setMode("edit");
  }, [savedValue]);

  const discardChanges = useCallback(() => {
    setDraftValue(savedValue);
    setError(null);
    setMode("view");
  }, [savedValue]);

  const updateDraftValue = useCallback((value: T) => {
    setDraftValue(value);
    setError(null);
  }, []);

  const completeEdit = useCallback(async () => {
    if (saveInFlightRef.current) {
      return false;
    }

    const nextValidationError = validate(draftValue);

    if (nextValidationError) {
      setError(nextValidationError);
      return false;
    }

    if (!isDirty) {
      setMode("view");
      setError(null);
      return true;
    }

    saveInFlightRef.current = true;
    setIsSaving(true);
    setError(null);

    try {
      await onSave(draftValue);
      setSavedValue(draftValue);
      setMode("view");
      return true;
    } catch {
      setError("保存できませんでした。もう一度お試しください");
      return false;
    } finally {
      saveInFlightRef.current = false;
      setIsSaving(false);
    }
  }, [draftValue, isDirty, onSave, validate]);

  const state: EditableSectionState<T> = {
    mode,
    savedValue,
    draftValue,
    isDirty,
    isValid,
    isSaving,
    error,
    validationError,
  };

  return {
    state,
    setDraftValue: updateDraftValue,
    setSavedValue,
    startEdit,
    completeEdit,
    discardChanges,
  };
}
