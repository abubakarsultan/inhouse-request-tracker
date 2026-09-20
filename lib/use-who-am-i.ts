'use client';
import { useEffect, useState, useCallback } from 'react';

const KEY = 'inhouse:who-am-i';

/**
 * "Who are you?" name picker (section 3): a plain localStorage value, not
 * authentication. Supplies `created_by_name` on new requests and
 * `changed_by` on status changes, and pre-selects the name on My Requests.
 */
export function useWhoAmI() {
  const [name, setNameState] = useState<string>('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      setNameState(localStorage.getItem(KEY) ?? '');
    } catch {
      // localStorage unavailable (e.g. private mode edge cases) — fall back to empty, still editable.
    }
    setLoaded(true);
  }, []);

  const setName = useCallback((value: string) => {
    setNameState(value);
    try {
      localStorage.setItem(KEY, value);
    } catch {
      // ignore — the picker still works in-memory for this session
    }
  }, []);

  return { name, setName, loaded };
}
