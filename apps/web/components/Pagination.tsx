import Link from 'next/link';

/** Compute a compact page list with ellipses around the current page. */
function pageWindow(current: number, total: number): (number | 'gap')[] {
  const wanted = new Set([1, total, current, current - 1, current + 1, current - 2, current + 2]);
  const pages = [...wanted].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out: (number | 'gap')[] = [];
  let prev = 0;
  for (const p of pages) {
    if (p - prev > 1) out.push('gap');
    out.push(p);
    prev = p;
  }
  return out;
}

export function Pagination({
  page,
  totalPages,
  hrefFor,
}: {
  page: number;
  totalPages: number;
  hrefFor: (page: number) => string;
}) {
  if (totalPages <= 1) return null;
  const window = pageWindow(page, totalPages);
  const atStart = page <= 1;
  const atEnd = page >= totalPages;

  const Nav = ({ to, label, disabled, title }: { to: number; label: string; disabled: boolean; title: string }) =>
    disabled ? (
      <span className="page-btn disabled" title={title}>
        {label}
      </span>
    ) : (
      <Link href={hrefFor(to)} className="page-btn" title={title} prefetch={false}>
        {label}
      </Link>
    );

  return (
    <nav className="pagination" aria-label="Pagination">
      <Nav to={1} label="«" disabled={atStart} title="First page" />
      <Nav to={page - 1} label="‹" disabled={atStart} title="Previous page" />
      {window.map((p, i) =>
        p === 'gap' ? (
          <span key={`gap-${i}`} className="page-gap">
            …
          </span>
        ) : p === page ? (
          <span key={p} className="page-btn current" aria-current="page">
            {p}
          </span>
        ) : (
          <Link key={p} href={hrefFor(p)} className="page-btn" prefetch={false}>
            {p}
          </Link>
        ),
      )}
      <Nav to={page + 1} label="›" disabled={atEnd} title="Next page" />
      <Nav to={totalPages} label="»" disabled={atEnd} title="Last page" />
    </nav>
  );
}
