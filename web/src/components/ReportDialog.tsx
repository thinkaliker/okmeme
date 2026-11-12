import { useState } from 'react';
import { Flag } from 'lucide-react';
import { reports } from '@/api/endpoints';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { FieldHint } from '@/components/ui/field';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
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
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setSent(false);
          setNote('');
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t('link.report')} className="text-muted-foreground">
          <Flag />
        </Button>
      </DialogTrigger>

      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('report.title')}</DialogTitle>
          <DialogDescription>{t('report.anonymous')}</DialogDescription>
        </DialogHeader>

        {sent ? (
          <p className="text-sm">{t('report.sent')}</p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="report-reason">{t('report.reason')}</Label>
              <NativeSelect
                id="report-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value as ReasonCategory)}
              >
                {REASONS.map((value) => (
                  <NativeSelectOption key={value} value={value}>
                    {REASON_LABEL[value]}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
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

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" size="sm">
              {sent ? t('app.close') : t('app.cancel')}
            </Button>
          </DialogClose>
          {sent ? null : (
            <Button size="sm" disabled={pending} onClick={() => void send()}>
              {t('report.send')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
