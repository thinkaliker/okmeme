import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { taxonomy } from '@/api/endpoints';
import type { Category } from '@/domain/link';
import { t, tOptional } from '@/i18n/t';
import { tintDot } from '@/lib/tint';
import { cn } from '@/lib/utils';

const linkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm transition-colors compact:py-1',
    isActive ? 'bg-accent text-accent-foreground font-medium' : 'hover:bg-accent/60',
  );

/**
 * The chip is a colour per category, derived from its slug — so a category keeps
 * the same colour on every instance and across a rename of its display name,
 * without anyone maintaining a palette by hand. There is no count beside it:
 * a count of a category is a count of rows, including the ones the viewer is
 * not allowed to know exist.
 */
function CategoryDot({ slug }: { slug: string }) {
  return <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={tintDot(slug)} />;
}

/**
 * Categories are the top-level axis: admin-created, exactly one per link. Tags
 * filter within or across them and are not listed here — a wall of every tag on
 * the instance is a worse control than a search box.
 */
export function CategoryNav({ onNavigate }: { onNavigate?: () => void }) {
  const [categories, setCategories] = useState<readonly Category[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    taxonomy
      .categories({ signal: controller.signal })
      .then(setCategories)
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  return (
    <nav aria-label={t('nav.categories')}>
      <ul className="flex flex-col gap-0.5">
        <li>
          <NavLink to="/" end className={linkClass} onClick={onNavigate}>
            <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-muted-foreground/40" />
            {t('nav.allCategories')}
          </NavLink>
        </li>
        {categories.map((category) => (
          <li key={category.slug}>
            <NavLink to={`/c/${category.slug}`} className={linkClass} onClick={onNavigate}>
              <CategoryDot slug={category.slug} />
              <span className="truncate">{tOptional(category.nameKey, category.name)}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
