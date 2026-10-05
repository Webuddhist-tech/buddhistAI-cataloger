import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Flag, Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { AdjudicationItem, DecisionInput, ReviewItem } from '../api/review';
import AnnotatorAnswers from '../components/AnnotatorAnswers';
import CantAnswerDialog, { type CantAnswerStart } from '../components/CantAnswerDialog';
import FullTextDialog, { type FullTextView } from '../components/FullTextDialog';
import PreferredCopyDialog, { type PreferredChoice } from '../components/PreferredCopyDialog';
import CopyPairLink from '../components/CopyPairLink';
import PairEvidence from '../components/PairEvidence';
import { useActiveTimer } from '../hooks/useActiveTimer';
import {
  useAdjudicationItem,
  useAdjudicationQueue,
  useBatchName,
  useItem,
  useMyItems,
  useSaveAdjudication,
  useSaveDecision,
} from '../hooks/useReview';
import { formatNumber, hasIssue, isDecided, issueLabel, verdictLabel } from '../utils';

const CONFIDENCE = [1, 2, 3, 4, 5];
// The shared Button has no pointer cursor; added here to leave other features untouched.
const PTR = 'cursor-pointer';
const CHOSEN_NEUTRAL = 'border-gray-800 bg-gray-800 text-white hover:bg-gray-900 hover:text-white';

export type ReviewMode = 'annotate' | 'adjudicate';

// Keys (plan §11): J same, F different, C contains / part-of, Space can't answer,
// X report a data problem on the saved answer, 1-5 confidence, arrows move.
//
// `adjudicate`: the same screen for a disputed pair, with both annotators' answers above
// the texts and an optional note. The adjudicator's answer is final.
export default function Review({ mode = 'annotate' }: Readonly<{ mode?: ReviewMode }>) {
  const { t } = useTranslation();
  const adjudicate = mode === 'adjudicate';
  const { itemId: itemIdParam } = useParams();
  const itemId = Number(itemIdParam);
  const navigate = useNavigate();
  const batchName = useBatchName();

  const annotatorItem = useItem(adjudicate ? undefined : itemId);
  const adjudicationItem = useAdjudicationItem(adjudicate ? itemId : undefined);
  const itemQuery = adjudicate ? adjudicationItem : annotatorItem;
  const myList = useMyItems('all', undefined, !adjudicate);
  const adjudicationList = useAdjudicationQueue('all', adjudicate);
  const list: { data?: ReviewItem[] } = adjudicate ? adjudicationList : myList;
  const loaded = useMemo(() => list.data ?? [], [list.data]);
  const total = loaded.length;
  const index = loaded.findIndex((i) => i.item_id === itemId);

  const prevId = index > 0 ? loaded[index - 1].item_id : null;
  const nextId = index >= 0 && index < loaded.length - 1 ? loaded[index + 1].item_id : null;
  const goTo = useCallback(
    (id: number | null) => {
      if (id != null) navigate(adjudicate ? `/dedup/adjudicate/${id}` : `/dedup/item/${id}`);
    },
    [navigate, adjudicate],
  );

  const item = itemQuery.data as ReviewItem | AdjudicationItem | undefined;
  const adjItem = adjudicate ? (item as AdjudicationItem | undefined) : undefined;
  const saveAnswer = useSaveDecision();
  const saveAdjudication = useSaveAdjudication();
  const save = adjudicate ? saveAdjudication : saveAnswer;
  // Both annotators have answered: the answer is shown but can no longer change.
  const locked = Boolean(!adjudicate && item?.locked);
  // Only for the person doing the work on the pair (an admin viewing it is not).
  const { commit: commitActiveTime } = useActiveTimer(
    item?.item_id,
    Boolean(item && loaded.some((i) => i.item_id === item.item_id)),
    Boolean(item && isDecided(item)),
  );
  const [note, setNote] = useState('');
  useEffect(() => {
    setNote(adjItem?.note ?? '');
  }, [adjItem?.item_id, adjItem?.note]);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [dialog, setDialog] = useState<CantAnswerStart | null>(null);
  const [fullText, setFullText] = useState<FullTextView | null>(null);
  const [askPreferred, setAskPreferred] = useState(false);
  const advanceTimer = useRef<number | undefined>(undefined);
  // The docked action bar wraps onto several rows on a phone; the page keeps its
  // height free so nothing is hidden behind it.
  const barRef = useRef<HTMLDivElement>(null);
  const [barHeight, setBarHeight] = useState(0);
  const hasItem = itemQuery.data != null;
  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBarHeight(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasItem]);

  useEffect(() => {
    setConfidence(item?.confidence ?? null);
  }, [item?.item_id, item?.confidence]);

  useEffect(() => () => window.clearTimeout(advanceTimer.current), []);

  const submit = useCallback(
    async (fields: DecisionInput) => {
      if (!item) return;
      const body: DecisionInput = {
        // Only "same" carries a preferred copy; clear a stale one.
        ...(fields.verdict && fields.verdict !== 'same' ? { partner_payload: null } : {}),
        ...fields,
        // Confidence only means something alongside a verdict.
        ...(fields.verdict && confidence != null ? { confidence } : {}),
      };
      commitActiveTime();
      try {
        if (adjudicate) await saveAdjudication.mutateAsync({ itemId: item.item_id, fields: { ...body, note: note.trim() || null } });
        else await saveAnswer.mutateAsync({ itemId: item.item_id, fields: body });
        // Reporting a problem on an answered pair stays here; answering moves on.
        if (fields.verdict) advanceTimer.current = window.setTimeout(() => goTo(nextId), 250);
      } catch (e) {
        toast.error(t('dedup.review.saveFailed', { error: (e as Error).message }));
        throw e;
      }
    },
    [item, confidence, adjudicate, note, saveAdjudication, saveAnswer, goTo, nextId, commitActiveTime, t],
  );

  // A note on an answer already saved goes with that same answer.
  const saveNote = useCallback(() => {
    if (!item?.verdict) return;
    saveAdjudication
      .mutateAsync({
        itemId: item.item_id,
        fields: {
          verdict: item.verdict,
          abstention_reason: item.abstention_reason,
          confidence: item.confidence,
          note: note.trim() || null,
        },
      })
      .then(() => toast.success(t('dedup.review.noteSaved')))
      .catch((e: Error) => toast.error(t('dedup.review.saveFailed', { error: e.message })));
  }, [item, note, saveAdjudication, t]);

  const decide = useCallback(
    (verdict: 'same' | 'different') => {
      if (verdict === 'same') {
        setAskPreferred(true);
        return;
      }
      submit({ verdict }).catch(() => {});
    },
    [submit],
  );

  const saveSame = useCallback(
    (preferred: PreferredChoice) => submit({ verdict: 'same', partner_payload: { preferred_mw_id: preferred } }),
    [submit],
  );

  // A data problem is reported alongside an answer (plan §5), so the pair needs one first.
  const answered = Boolean(item && isDecided(item));
  const reportProblem = useCallback(() => {
    if (locked) toast.info(t('dedup.review.lockedInfo'));
    else if (answered) setDialog('issue');
    else toast.info(t('dedup.review.answerFirst'));
  }, [answered, locked, t]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (dialog || fullText || askPreferred || e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const k = e.key.toLowerCase();
      if (k === 'arrowleft') goTo(prevId);
      else if (k === 'arrowright') goTo(nextId);
      else if (locked) return;
      else if (k === 'j') decide('same');
      else if (k === 'f') decide('different');
      else if (k === 'c') setDialog('contains');
      else if (k === 'x') reportProblem();
      else if (k === ' ') {
        e.preventDefault();
        setDialog('default');
      } else if (k >= '1' && k <= '5') setConfidence(Number(k));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dialog, fullText, askPreferred, decide, reportProblem, goTo, prevId, nextId, locked]);

  // Someone else's pair (e.g. a link copied from the address bar into a spreadsheet):
  // show the read-only page instead of a work page they cannot use.
  const notMine = itemQuery.error != null || (item != null && !itemQuery.isPlaceholderData && item.assignment == null);
  if (!adjudicate && notMine) {
    return <Navigate to={`/dedup/pair/${itemIdParam}`} replace />;
  }

  if (itemQuery.isLoading) {
    return <div className="py-24 text-center text-gray-500">{t('dedup.review.loading')}</div>;
  }
  if (itemQuery.error || !item) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {t('dedup.review.loadFailed', { id: itemIdParam, error: itemQuery.error?.message ?? t('dedup.review.notFound') })}
        </div>
      </div>
    );
  }

  const ev = item.evidence;
  const cardA = ev.a ?? { mw_id: item.subject.a_mw ?? '' };
  const cardB = ev.b ?? { mw_id: item.subject.b_mw ?? '' };
  const isChosen = (...v: string[]) => item.verdict != null && v.includes(item.verdict);
  const tick = (...v: string[]) => (isChosen(...v) ? <Check className="h-4 w-4" /> : null);
  // The saved "which copy" answer: undefined = never asked, null = no preference.
  const preferred = item.partner_payload?.preferred_mw_id as PreferredChoice | undefined;
  let preferredNote = '';
  if (item.verdict === 'same' && preferred !== undefined) {
    if (preferred === null) preferredNote = ` · ${t('dedup.review.noPreference')}`;
    else preferredNote = ` · ${t(preferred === cardA.mw_id ? 'dedup.review.aBetter' : 'dedup.review.bBetter')}`;
  }
  const recorded = item.verdict ? verdictLabel(item.verdict) + preferredNote : null;
  const problems = hasIssue(item) ? item.issues!.map((i) => issueLabel(i.kind)) : [];

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6" style={{ paddingBottom: barHeight + 24 }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to={adjudicate ? '/dedup/adjudicate' : '/dedup'}
          className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" /> {t(adjudicate ? 'dedup.adjudicationQueue.title' : 'dedup.review.myItems')}
          <span className="ml-1 text-xs text-gray-400" title={item.batch_id}>· {batchName(item.batch_id)}</span>
        </Link>
        <div className="flex items-center gap-2">
          <CopyPairLink itemId={item.item_id} />
          {index >= 0 && (
            <span className="mr-1 text-xs tabular-nums text-gray-500">
              {t('dedup.review.position', { n: formatNumber(index + 1), total: formatNumber(total) })}
            </span>
          )}
          <Button variant="outline" size="sm" className={PTR} onClick={() => goTo(prevId)} disabled={prevId == null} aria-label={t('dedup.review.previousItem')}>
            <ArrowLeft className="h-4 w-4" /> <span className="hidden sm:inline">{t('dedup.review.previous')}</span>
          </Button>
          <Button variant="outline" size="sm" className={PTR} onClick={() => goTo(nextId)} disabled={nextId == null} aria-label={t('dedup.review.nextItem')}>
            <span className="hidden sm:inline">{t('dedup.review.next')}</span> <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <PairEvidence evidence={ev} cardA={cardA} cardB={cardB} onFullText={setFullText}>
        {adjItem && <AnnotatorAnswers answers={adjItem.annotations} a={cardA} b={cardB} />}
      </PairEvidence>

      {adjudicate && (
        <div className="mt-4 rounded-lg border border-gray-200 bg-white px-4 py-3">
          <label htmlFor="adjudication-note" className="text-sm font-medium text-gray-700">
            {t('dedup.review.note')} <span className="font-normal text-gray-400">{t('dedup.cantAnswer.optional')}</span>
          </label>
          <Textarea
            id="adjudication-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('dedup.review.notePlaceholder')}
            maxLength={2000}
            className="mt-1.5 min-h-[64px] text-sm"
          />
          {answered && note.trim() !== (adjItem?.note ?? '') && (
            <div className="mt-2 flex justify-end">
              <Button size="sm" variant="outline" className={PTR} onClick={saveNote} disabled={save.isPending}>
                {t('dedup.review.saveNote')}
              </Button>
            </div>
          )}
        </div>
      )}

      <div
        ref={barRef}
        className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgba(0,0,0,0.06)] backdrop-blur"
      >
        {/* Status strip: what is saved for this pair, and its data problems. Shown once there is something to say. */}
        {(answered || problems.length > 0 || save.isPending || locked) && (
          <div className="border-b border-gray-100 bg-gray-50/80">
            <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2 text-xs sm:px-6 lg:px-8">
              {save.isPending ? (
                <span className="text-gray-500">{t('dedup.common.saving')}</span>
              ) : (
                recorded && (
                  <span className="inline-flex items-center gap-1.5 text-gray-600">
                    <Check className="h-3.5 w-3.5 text-green-600" />
                    {t(adjudicate ? 'dedup.review.finalAnswer' : 'dedup.review.saved')} <span className="font-medium text-gray-900">{recorded}</span>
                  </span>
                )
              )}
              {problems.map((p, i) => (
                <span
                  key={`${p}-${i}`}
                  className="inline-flex max-w-full items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 font-medium text-amber-800"
                >
                  <Flag className="h-3 w-3 shrink-0" />
                  <span className="truncate">{p}</span>
                </span>
              ))}
              {!answered && problems.length > 0 && <span className="text-amber-800">{t('dedup.review.needsAnswer')}</span>}
              {locked && (
                <span className="inline-flex items-center gap-1.5 text-gray-600">
                  <Lock className="h-3.5 w-3.5" /> Both annotators have answered, so this answer is locked
                </span>
              )}
              {answered && !locked && (
                <button
                  type="button"
                  onClick={reportProblem}
                  disabled={save.isPending}
                  className={`${PTR} ml-auto inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-medium text-gray-600 hover:bg-amber-50 hover:text-amber-800 disabled:opacity-50`}
                  title={t('dedup.review.reportTitle')}
                >
                  <Flag className="h-3.5 w-3.5" />
                  {t(problems.length ? 'dedup.review.reportAnother' : 'dedup.review.reportProblem')}
                  <Kbd>X</Kbd>
                </button>
              )}
            </div>
          </div>
        )}

        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:px-8">
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <Button
              variant="outline"
              className={`${PTR} ${
                isChosen('same')
                  ? 'border-green-600 bg-green-600 text-white hover:bg-green-700 hover:text-white'
                  : 'border-green-300 text-green-700 hover:bg-green-50'
              }`}
              onClick={() => decide('same')}
              disabled={save.isPending || locked}
              aria-pressed={isChosen('same')}
            >
              {tick('same')} {t('dedup.verdict.same')} <Kbd>J</Kbd>
            </Button>
            <Button
              variant="outline"
              className={`${PTR} ${
                isChosen('different')
                  ? 'border-red-600 bg-red-600 text-white hover:bg-red-700 hover:text-white'
                  : 'border-red-300 text-red-700 hover:bg-red-50'
              }`}
              onClick={() => decide('different')}
              disabled={save.isPending || locked}
              aria-pressed={isChosen('different')}
            >
              {tick('different')} {t('dedup.verdict.different')} <Kbd>F</Kbd>
            </Button>
            <Button
              variant="outline"
              className={`${PTR} ${isChosen('contains', 'part_of') ? CHOSEN_NEUTRAL : ''}`}
              onClick={() => setDialog('contains')}
              disabled={save.isPending || locked}
              aria-pressed={isChosen('contains', 'part_of')}
            >
              {tick('contains', 'part_of')} {t('dedup.cantAnswer.group.contains.title')} <Kbd>C</Kbd>
            </Button>
            <Button
              variant="outline"
              className={`${PTR} ${isChosen('not_sure') ? CHOSEN_NEUTRAL : ''}`}
              onClick={() => setDialog('default')}
              disabled={save.isPending || locked}
              aria-pressed={isChosen('not_sure')}
            >
              {tick('not_sure')} {t('dedup.answer.cantAnswer')} <Kbd>{t('dedup.review.spaceKey')}</Kbd>
            </Button>
          </div>

          <div className="flex items-center justify-center gap-1.5 sm:justify-start lg:ml-auto">
            <span className="mr-1 text-[11px] font-medium uppercase tracking-wide text-gray-500">{t('dedup.review.confidence')}</span>
            {CONFIDENCE.map((n) => (
              <button
                key={n}
                onClick={() => setConfidence(confidence === n ? null : n)}
                disabled={locked}
                className={`h-9 w-9 cursor-pointer rounded-md border text-sm tabular-nums ${
                  confidence === n
                    ? 'border-gray-900 bg-gray-900 text-white'
                    : 'border-gray-300 text-gray-600 hover:border-gray-500'
                }`}
                title={t('dedup.review.confidenceN', { n: formatNumber(n) })}
                aria-pressed={confidence === n}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </div>

      {fullText && (
        <FullTextDialog a={cardA} b={cardB} view={fullText} onViewChange={setFullText} onClose={() => setFullText(null)} />
      )}

      <PreferredCopyDialog
        open={askPreferred}
        onOpenChange={setAskPreferred}
        a={cardA}
        b={cardB}
        current={item.verdict === 'same' ? preferred : undefined}
        onPick={saveSame}
      />

      <CantAnswerDialog
        open={dialog != null}
        onOpenChange={(o) => !o && setDialog(null)}
        item={item}
        start={dialog ?? 'default'}
        onSubmit={submit}
      />
    </div>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="ml-1 hidden rounded border border-current px-1 font-mono text-[10px] opacity-60 sm:inline">{children}</kbd>
  );
}
