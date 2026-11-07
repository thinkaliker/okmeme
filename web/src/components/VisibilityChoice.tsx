import { Badge } from '@/components/ui/badge';
import { FieldHint } from '@/components/ui/field';
import { AUTHOR_TIER_LABELS, TIER } from '@/domain/tier';
import { t, tierLabel } from '@/i18n/t';

interface VisibilityChoiceProps {
  /** Radio group name; unique per form on the page. */
  name: string;
  /** The author's own tier. Nothing above it is ever offered. */
  own: number;
  /** Where the post lives. null (nothing chosen yet) means the author's own tier. */
  value: number | null;
  onChange: (next: number) => void;
  /** Levels the server would refuse, shown but not selectable. */
  isDisabled?: (level: number) => boolean;
  hint: string;
}

/**
 * Where a post lives: the author's own tier, or one below it for a wider
 * audience. Shared by the submit form and the edit dialog.
 *
 * Each option is described by the lowest tier that can see the post, one below
 * where it lives. Every label offered is at or below the author's own tier, so
 * the control teaches them nothing about the ring above them.
 */
export function VisibilityChoice({ name, own, value, onChange, isDisabled, hint }: VisibilityChoiceProps) {
  const levels: number[] = [];
  for (let level = own; level >= TIER.limited; level -= 1) levels.push(level);

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium">{t('submit.visibility')}</legend>
      <div className="flex flex-wrap gap-2">
        {levels.map((level) => {
          const lowest = AUTHOR_TIER_LABELS[level - 2];
          const isDefault = level === own;
          const disabled = isDisabled?.(level) ?? false;
          return (
            <label
              key={level}
              className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm has-checked:border-primary has-checked:bg-accent has-disabled:cursor-not-allowed has-disabled:opacity-50"
            >
              <input
                type="radio"
                name={name}
                checked={(value ?? own) === level}
                disabled={disabled}
                onChange={() => onChange(level)}
                className="accent-primary"
              />
              {lowest === undefined ? (
                t('submit.visibilityEveryone')
              ) : (
                <>
                  <Badge variant="tier">{tierLabel(lowest)}</Badge>
                  <span>{t('submit.visibilityAndUp')}</span>
                </>
              )}
              {isDefault ? (
                <span className="text-xs text-muted-foreground">{t('submit.visibilityDefault')}</span>
              ) : null}
            </label>
          );
        })}
      </div>
      <FieldHint>{hint}</FieldHint>
    </fieldset>
  );
}
