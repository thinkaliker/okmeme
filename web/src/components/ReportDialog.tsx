import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Flag } from 'lucide-react';
import { reports } from '@/api/endpoints';
import { Button } from '@/components/ui/button';
import { FieldHint, Label, Select, Textarea } from '@/components/ui/field';
import type { ReasonCategory } from '@/domain/user';
import { t } from '@/i18n/t';

const REASONS: readonly ReasonCategory[] = ['spam', 'abuse', 'nsfw', 'other'];

const REASON_LABEL: Readonly<Record<ReasonCategory, string>> = {
  spam: t('sanction.reason.spam'),
  abuse: t('sanction.reason.abuse'),
  nsfw: t('sanction.reason.nsfw'),
  other: t('sanction.reason.other'),
};

interface ReportDialogProps {
  subject: { type: 'link' | 'user'; publicId: string };
}

/**
 * Every report lands in the single admin queue regardless of what was reported,
 * and the reporter is never disclosed to the reported. The response confirms
 * receipt and says nothing about the subject — including whether it still exists.
 */
export function ReportDialog({ subject }: ReportDialogProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReasonCategory>('spam');
  const [note, setNote] = useState('');
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);

  async function send() {
    setPending(true);
    try {
      await reports.create(subject, reason, note);
      setSent(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setSent(false);
          setNote('');
        }
      }}
    >
      <Dialog.Trigger asChild>
        <Button variant="ghost" size="icon" aria-label={t('link.report')} className="text-muted-foreground">
          <Flag />
        </Button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-popover p-5 text-popover-foreground shadow-lg">
          <Dialog.Title className="text-base font-semibold">{t('report.title')}</Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-muted-foreground">
            {t('report.anonymous')}
          </Dialog.Description>

          {sent ? (
            <p className="mt-4 text-sm">{t('report.sent')}</p>
          ) : (
            <div className="mt-4 flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="report-reason">{t('report.reason')}</Label>
                <Select
                  id="report-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value as ReasonCategory)}
                >
                  {REASONS.map((value) => (
                    <option key={value} value={value}>
                      {REASON_LABEL[value]}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="report-note">{t('report.note')}</Label>
                <Textarea
                  id="report-note"
                  value={note}
                  maxLength={1000}
                  onChange={(event) => setNote(event.target.value)}
                />
                <FieldHint>{t('report.anonymous')}</FieldHint>
              </div>
            </div>
          )}

          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button variant="ghost" size="sm">
                {sent ? t('app.close') : t('app.cancel')}
              </Button>
            </Dialog.Close>
            {sent ? null : (
              <Button size="sm" disabled={pending} onClick={() => void send()}>
                {t('report.send')}
              </Button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
