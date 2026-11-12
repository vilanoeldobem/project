/** Data-loading hooks: plain React state, one request per screen, errors as pt-BR sentences. */
import { useCallback, useEffect, useRef, useState } from "react";

import { errorText } from "@vila/shared/accounts/errors";

import type { Page } from "./api";

export interface Loaded<T> {
  data: T | null;
  /** pt-BR sentence, empty when there is no error. */
  error: string;
  loading: boolean;
  reload: () => void;
}

/** Loads once per `key` (and again on `reload`); a response that arrives after the key changed is dropped. */
export function useLoad<T>(load: () => Promise<T>, key: string): Loaded<T> {
  const [state, setState] = useState<{ data: T | null; error: string; loading: boolean }>({ data: null, error: "", loading: true });
  const [attempt, setAttempt] = useState(0);
  const latest = useRef(load);
  latest.current = load;
  useEffect(() => {
    let live = true;
    setState((s) => ({ ...s, error: "", loading: true }));
    latest.current().then(
      (data) => live && setState({ data, error: "", loading: false }),
      (e) => live && setState({ data: null, error: errorText(e), loading: false })
    );
    return () => {
      live = false;
    };
  }, [key, attempt]);
  return { ...state, reload: useCallback(() => setAttempt((n) => n + 1), []) };
}

export interface Paged<T> {
  /** null until the first page arrives. */
  items: T[] | null;
  /** True when older rows exist. */
  hasMore: boolean;
  error: string;
  loading: boolean;
  more: () => void;
  /** Repeats the request that failed (the first page or the last "more"); what is loaded stays. */
  retry: () => void;
}

/** Newest-first list read page by page ("Carregar mais"): the first page replaces, the next ones append. */
export function usePaged<T>(fetchPage: (before?: string) => Promise<Page<T>>): Paged<T> {
  const [items, setItems] = useState<T[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const fetcher = useRef(fetchPage);
  fetcher.current = fetchPage;
  const request = useRef(0);
  const asked = useRef<string | undefined>(undefined);
  const load = useCallback((before?: string) => {
    const mine = ++request.current;
    asked.current = before;
    setLoading(true);
    setError("");
    fetcher.current(before).then(
      (page) => {
        if (mine !== request.current) return;
        setItems((current) => (before && current ? [...current, ...page.items] : page.items));
        setNext(page.next);
        setLoading(false);
      },
      (e) => {
        if (mine !== request.current) return;
        setError(errorText(e));
        setLoading(false);
      }
    );
  }, []);
  useEffect(() => load(), [load]);
  return { items, hasMore: next !== null, error, loading, more: () => next && !loading && load(next), retry: () => load(asked.current) };
}
