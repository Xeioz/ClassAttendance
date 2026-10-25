import { useState } from 'react';

/** Scope changes reset navigation without effects or rendering an empty stale page. */
export function usePagination<T>(items: T[], pageSize: number, scope: string) {
  const [selection, setSelection] = useState({ scope, page: 0 });
  const lastPage = Math.max(0, Math.ceil(items.length / pageSize) - 1);
  const page = selection.scope === scope ? Math.min(selection.page, lastPage) : 0;
  return {
    page,
    visible: items.slice(page * pageSize, (page + 1) * pageSize),
    setPage: (next: number) => setSelection({ scope, page: Math.max(0, Math.min(next, lastPage)) }),
  };
}
