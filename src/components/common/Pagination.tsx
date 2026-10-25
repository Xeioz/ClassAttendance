import { t } from '../../i18n';

export function Pagination({
  page,
  pageSize,
  count,
  label,
  onPage,
}: {
  page: number;
  pageSize: number;
  count: number;
  label: string;
  onPage: (page: number) => void;
}) {
  return (
    <nav aria-label={label} className="my-3 flex flex-wrap items-center gap-3 text-sm">
      <p role="status" aria-atomic="true">
        {t('pagination.range', {
          first: count ? page * pageSize + 1 : 0,
          last: Math.min((page + 1) * pageSize, count),
          count,
        })}
      </p>
      {count > pageSize ? (
        <>
          <button
            type="button"
            className="secondary"
            disabled={page === 0}
            onClick={() => onPage(page - 1)}
          >
            {t('pagination.previous')}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={(page + 1) * pageSize >= count}
            onClick={() => onPage(page + 1)}
          >
            {t('pagination.next')}
          </button>
        </>
      ) : null}
    </nav>
  );
}
