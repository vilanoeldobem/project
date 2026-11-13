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
  /** Repeats the request that failed (the first page, the last "more" or a reload); what is loaded stays. */
  retry: () => void;
  /** Reads again, from the API, as many pages as are on screen (after a change, or when the screen is out of date). */
  reload: () => void;
  /** Changes what is on screen without a request (a row the API has just answered with). */
  patch: (change: (items: T[]) => T[]) => void;
}

/** The first `count` pages of a newest-first list, read one after the other, as one page. Pure. */
export async function readPages<T>(fetchPage: (before?: string) => Promise<Page<T>>, count: number): Promise<Page<T>> {
  const items: T[] = [];
  let before: string | undefined;
  for (let read = 0; ; ) {
    const page = await fetchPage(before);
    items.push(...page.items);
    if (page.next === null || ++read >= count) return { items, next: page.next };
    before = page.next;
  }
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
  /** Pages on screen, and the request to repeat on "Tentar de novo". */
  const pages = useRef(0);
  const again = useRef<() => void>(() => {});
  /** One request at a time: a newer one makes the answer of an older one be dropped. */
  const run = useCallback((read: () => Promise<Page<T>>, done: (page: Page<T>) => void) => {
    const mine = ++request.current;
    again.current = () => run(read, done);
    setLoading(true);
    setError("");
    read().then(
      (page) => {
        if (mine !== request.current) return;
        done(page);
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
  const load = useCallback(
    (before?: string) =>
      run(
        () => fetcher.current(before),
        (page) => {
          pages.current = before ? pages.current + 1 : 1;
          setItems((current) => (before && current ? [...current, ...page.items] : page.items));
        }
      ),
    [run]
  );
  const reload = useCallback(() => {
    const count = Math.max(1, pages.current);
    run(
      () => readPages(fetcher.current, count),
      (page) => setItems(page.items)
    );
  }, [run]);
  const patch = useCallback((change: (items: T[]) => T[]) => setItems((current) => (current ? change(current) : current)), []);
  useEffect(() => load(), [load]);
  return { items, hasMore: next !== null, error, loading, more: () => next && !loading && load(next), retry: () => again.current(), reload, patch };
}
