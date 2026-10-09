import type { Author } from '@/domain/author';
import { Badge } from '@/components/ui/badge';
import { t, tierLabel } from '@/i18n/t';

/**
 * Renders whichever of the two things the server sent, and nothing else.
 *
 * The brackets around a tier label are separate, aria-hidden nodes: the label
 * text itself comes out of the catalogue table untouched. It is a security
 * boundary rendered as a word, and a word that gets assembled is a word that can
 * get assembled wrongly.
 *
 * There is nothing here that distinguishes one `[full]` from another, because
 * there is nothing in the payload to distinguish them with. A stable pseudonym
 * across a tier boundary is a lifetime correlation handle.
 */
export function AuthorLabel({ author }: { author: Author }) {
  if (author.kind === 'user') {
    return <span className="font-medium text-foreground">{author.name}</span>;
  }

  return (
    <Badge variant="tier" title={t('tier.aboveYou')}>
      <span aria-hidden="true">[</span>
      {tierLabel(author.label)}
      <span aria-hidden="true">]</span>
    </Badge>
  );
}
