import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Download, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useUser } from '@/hooks/useUser';
import { exportWorkCsv, type OutlineIssue, type SegmentEdit, type SpanValues, type WorkDetail } from '../api';
import { checkIssue, issueRids, stripBdr, toRid, type CheckResult } from '../checker';
import { useCompleteWork, useSaveEdits, useSkipWork, useWork } from '../hooks';
import { PART_TYPES, SPAN_FIELDS, initialValues, parseSegments, sameValues, type Segment } from '../outline';
import { STATUS_LABEL, STATUS_STYLE } from '../utils';

// Issue context, in the order BDRC lists it.
const CONTEXT_ROLES: [keyof OutlineIssue, string][] = [
  ['left_2', 'Left 2'],
  ['left', 'Left'],
  ['issue', 'Issue'],
  ['right', 'Right'],
  ['right_2', 'Right 2'],
];
// Rows shown above and below an issue's context. Outlines run to 8,000+ rows, too many to
// render as editable cards at once; the search box reaches any other segment.
const WINDOW = 6;
const SEARCH_LIMIT = 50;

const bdrcUrl = (rid: string) => `https://library.bdrc.io/show/bdr:${stripBdr(rid)}`;

export default function Workspace() {
  const { workId } = useParams<{ workId: string }>();
  const work = useWork(workId);

  if (work.isLoading) return <div className="p-8 text-sm text-gray-500">Loading work…</div>;
  if (work.error || !work.data) {
    return (
      <div className="p-8 text-sm text-red-700">
        Could not load this work: {work.error?.message ?? 'not found'}.{' '}
        <Link to="/outline-fix" className="underline">Back to my works</Link>
      </div>
    );
  }
  // Keyed so opening another work starts from fresh state.
  return <WorkspaceView key={work.data.id} work={work.data} />;
}

function WorkspaceView({ work }: { readonly work: WorkDetail }) {
  const navigate = useNavigate();
  const { user } = useUser();
  const save = useSaveEdits();
  const complete = useCompleteWork();
  const skip = useSkipWork();

  const segments = useMemo(() => parseSegments(work.outline_header, work.outline_rows), [work]);
  const segmentByRid = useMemo(() => new Map(segments.map((s) => [s.rid, s])), [segments]);
  // `saved` is what the server has; `values` is what is on screen.
  const [saved, setSaved] = useState(() => initialValues(segments, work.edits));
  const [values, setValues] = useState(saved);
  const [selected, setSelected] = useState(0);
  const [viewRid, setViewRid] = useState(() => toRid(work.issues[0]?.issue?.id));
  const [search, setSearch] = useState('');
  const [skipOpen, setSkipOpen] = useState(false);

  const editable = work.status === 'in_progress' && work.assigned_to === user?.id;
  const dirtyRids = useMemo(
    () => [...values].filter(([rid, v]) => !sameValues(v, saved.get(rid)!)).map(([rid]) => rid),
    [values, saved],
  );
  const dirty = dirtyRids.length > 0;

  const checks = useMemo(() => work.issues.map((issue) => checkIssue(issue, values)), [work.issues, values]);
  const resolved = checks.filter((c) => c.status === 'resolved').length;

  // Which issue (if any) each RID is the subject of, for badges and check notes.
  const issueIndexByRid = useMemo(() => {
    const m = new Map<string, number>();
    work.issues.forEach((issue, i) => {
      const rid = toRid(issue.issue?.id);
      if (rid && !m.has(rid)) m.set(rid, i);
    });
    return m;
  }, [work.issues]);

  const issue = work.issues[selected] as OutlineIssue | undefined;
  const roleByRid = useMemo(() => {
    const m = new Map<string, string>();
    if (!issue) return m;
    for (const [key, label] of CONTEXT_ROLES) {
      const id = (issue[key] as { id?: string } | undefined)?.id;
      if (id) m.set(toRid(id), label);
    }
    return m;
  }, [issue]);

  const visible: Segment[] = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (needle) {
      return segments
        .filter((s) => s.rid.toLowerCase().includes(needle) || s.title.toLowerCase().includes(needle))
        .slice(0, SEARCH_LIMIT);
    }
    if (!issue) return segments.slice(0, WINDOW * 4);
    const indexes = [...roleByRid.keys(), ...issueRids(issue)]
      .map((rid) => segmentByRid.get(rid)?.index)
      .filter((i): i is number => i != null);
    if (!indexes.length) return [];
    const from = Math.max(0, Math.min(...indexes) - WINDOW);
    const to = Math.min(segments.length, Math.max(...indexes) + WINDOW + 1);
    return segments.slice(from, to);
  }, [search, segments, issue, roleByRid, segmentByRid]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const selectIssue = (i: number) => {
    setSelected(i);
    setSearch('');
    setViewRid(toRid(work.issues[i]?.issue?.id));
  };

  const setValue = useCallback((rid: string, next: SpanValues) => {
    setValues((prev) => new Map(prev).set(rid, next));
  }, []);

  const resetSegment = useCallback(
    (rid: string) => setValue(rid, segmentByRid.get(rid)!.original),
    [setValue, segmentByRid],
  );

  const persist = async (): Promise<boolean> => {
    // Every segment that differs from the imported CSV; the server drops the rest.
    const edits: SegmentEdit[] = segments
      .filter((s) => !sameValues(values.get(s.rid)!, s.original))
      .map((s) => ({ rid: s.rid, ...values.get(s.rid)! }));
    try {
      await save.mutateAsync({ id: work.id, edits });
      setSaved(values);
      return true;
    } catch (e) {
      toast.error(`Save failed: ${(e as Error).message}`);
      return false;
    }
  };

  const onSave = async () => {
    if (await persist()) toast.success('Saved');
  };

  const onComplete = async () => {
    if (dirty && !(await persist())) return;
    const open = checks.length - resolved;
    if (open > 0 && !window.confirm(`${open} issue(s) still not resolved. Mark the work completed anyway?`)) return;
    try {
      await complete.mutateAsync(work.id);
      toast.success(`${work.w_id} completed`);
      navigate('/outline-fix');
    } catch (e) {
      toast.error(`Could not complete: ${(e as Error).message}`);
    }
  };

  const onSkip = async (note: string) => {
    if (dirty && !(await persist())) return;
    try {
      await skip.mutateAsync({ id: work.id, note });
      toast.success(`${work.w_id} skipped`);
      navigate('/outline-fix');
    } catch (e) {
      toast.error(`Could not skip: ${(e as Error).message}`);
    }
  };

  const onDownload = async () => {
    if (dirty) toast.info('Downloading the last saved version; save to include your latest changes.');
    try {
      await exportWorkCsv(work.id, work.w_id);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const busy = save.isPending || complete.isPending || skip.isPending;
  const signalClass =
    checks.length === 0
      ? 'bg-gray-100 text-gray-600'
      : resolved === checks.length
        ? 'bg-green-50 text-green-700'
        : 'bg-red-50 text-red-700';

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col bg-gray-50">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link to="/outline-fix" className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900">
            <ArrowLeft className="h-4 w-4" /> My works
          </Link>
          <h1 className="font-mono text-lg font-semibold text-gray-900">{work.w_id}</h1>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[work.status]}`}>
            {STATUS_LABEL[work.status]}
          </span>
          {!editable && <span className="text-xs text-gray-500">Read only</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-sm font-medium ${signalClass}`}>
            {checks.length === 0 ? 'No issues' : `${resolved === checks.length ? '✔' : '✖'} ${resolved}/${checks.length} resolved`}
          </span>
          <Button asChild variant="outline" size="sm">
            <a href={bdrcUrl(work.w_id)} target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4" /> Open in BDRC
            </a>
          </Button>
          <Button variant="outline" size="sm" className="cursor-pointer" onClick={onDownload}>
            <Download className="h-4 w-4" /> CSV
          </Button>
          {editable && (
            <>
              <Button variant="outline" size="sm" className="cursor-pointer" onClick={() => setSkipOpen(true)} disabled={busy}>
                Skip
              </Button>
              <Button variant="outline" size="sm" className="cursor-pointer" onClick={onSave} disabled={busy || !dirty}>
                {save.isPending ? 'Saving…' : dirty ? `Save (${dirtyRids.length})` : 'Saved'}
              </Button>
              <Button size="sm" className="cursor-pointer" onClick={onComplete} disabled={busy}>
                Complete
              </Button>
            </>
          )}
        </div>
      </div>

      {work.note && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">Note: {work.note}</div>
      )}

      <div className="flex min-h-0 flex-1 gap-3 p-3">
        {/* Issues */}
        <section className="flex w-80 shrink-0 flex-col rounded-lg border border-gray-200 bg-white">
          <PanelHead title="Issues" count={`${work.issues.length} issue(s)`} />
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
            {work.issues.length === 0 && <p className="text-sm text-gray-500">No issues recorded for this work.</p>}
            {work.issues.map((iss, i) => (
              <IssueCard key={i} issue={iss} check={checks[i]} active={i === selected} onClick={() => selectIssue(i)} />
            ))}
          </div>
        </section>

        {/* BDRC */}
        <section className="flex min-w-0 flex-1 flex-col rounded-lg border border-gray-200 bg-white">
          <PanelHead
            title="BDRC"
            count={
              viewRid ? (
                <a href={bdrcUrl(viewRid)} target="_blank" rel="noreferrer" className="hover:underline">
                  {stripBdr(viewRid)} · open in new tab if blank
                </a>
              ) : undefined
            }
          />
          {viewRid ? (
            <iframe title="BDRC" src={bdrcUrl(viewRid)} className="min-h-0 w-full flex-1 rounded-b-lg" />
          ) : (
            <p className="flex-1 p-4 text-sm text-gray-500">Select a segment to view it on BDRC.</p>
          )}
          {/* Under the embed, as in the original fixer: steps through the issues. */}
          <div className="flex justify-center gap-2 border-t border-gray-200 p-2">
            <Button variant="outline" size="sm" className="cursor-pointer" disabled={selected <= 0} onClick={() => selectIssue(selected - 1)}>
              Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="cursor-pointer"
              disabled={selected >= work.issues.length - 1}
              onClick={() => selectIssue(selected + 1)}
            >
              Next
            </Button>
          </div>
        </section>

        {/* Segments */}
        <section className="flex w-[26rem] shrink-0 flex-col rounded-lg border border-gray-200 bg-white">
          <PanelHead title="Segments" count={`${segments.length} in outline`} />
          <div className="border-b border-gray-200 p-2">
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Find any segment by RID or title"
              className="h-8 text-sm"
            />
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
            {search && visible.length === 0 && <p className="text-sm text-gray-500">No segment matches "{search}".</p>}
            {visible.map((seg) => {
              const issueIdx = issueIndexByRid.get(seg.rid);
              return (
                <SegmentCard
                  key={seg.rid || seg.index}
                  segment={seg}
                  value={values.get(seg.rid)!}
                  role={search ? undefined : roleByRid.get(seg.rid)}
                  issueType={issueIdx != null ? work.issues[issueIdx].error_type : undefined}
                  check={issueIdx != null ? checks[issueIdx] : undefined}
                  dirty={!sameValues(values.get(seg.rid)!, saved.get(seg.rid)!)}
                  edited={!sameValues(values.get(seg.rid)!, seg.original)}
                  editable={editable}
                  viewing={seg.rid === viewRid}
                  onChange={setValue}
                  onReset={resetSegment}
                  onView={setViewRid}
                />
              );
            })}
          </div>
        </section>
      </div>

      <SkipDialog open={skipOpen} onOpenChange={setSkipOpen} onSkip={onSkip} busy={busy} />
    </div>
  );
}

function PanelHead({ title, count }: { readonly title: string; readonly count?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-gray-200 px-4 py-2.5">
      <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
      {count && <span className="truncate text-xs text-gray-500">{count}</span>}
    </div>
  );
}

function CheckBadge({ check }: { readonly check: CheckResult }) {
  if (check.status === 'resolved') return <span className="rounded bg-green-50 px-1.5 py-0.5 text-xs font-medium text-green-700">✔ Resolved</span>;
  if (check.status === 'unresolved') return <span className="rounded bg-red-50 px-1.5 py-0.5 text-xs font-medium text-red-700">✖ Still failing</span>;
  return <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-600">? Unverifiable</span>;
}

function IssueCard({
  issue,
  check,
  active,
  onClick,
}: {
  readonly issue: OutlineIssue;
  readonly check: CheckResult;
  readonly active: boolean;
  readonly onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full cursor-pointer rounded-md border p-3 text-left transition-colors ${
        active ? 'border-red-300 bg-red-50/40 ring-1 ring-red-200' : 'border-gray-200 hover:bg-gray-50'
      }`}
    >
      <div className="break-all font-mono text-xs text-gray-700">{stripBdr(issue.issue?.id)}</div>
      <div className="mt-1 line-clamp-3 font-monlam text-sm leading-relaxed text-gray-900">{issue.issue?.title || '(no title)'}</div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="rounded bg-orange-50 px-1.5 py-0.5 text-xs text-orange-700">{issue.error_type ?? 'unknown'}</span>
        {issue.volume_number != null && <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">Vol {issue.volume_number}</span>}
        <CheckBadge check={check} />
      </div>
      <div className={`mt-2 break-all text-xs ${check.status === 'resolved' ? 'text-green-700' : 'text-red-700'}`}>{check.detail}</div>
    </button>
  );
}

interface SegmentCardProps {
  readonly segment: Segment;
  readonly value: SpanValues;
  readonly role?: string;
  readonly issueType?: string;
  readonly check?: CheckResult;
  readonly dirty: boolean;
  readonly edited: boolean;
  readonly editable: boolean;
  readonly viewing: boolean;
  readonly onChange: (rid: string, v: SpanValues) => void;
  readonly onReset: (rid: string) => void;
  readonly onView: (rid: string) => void;
}

const FIELD_LABEL: Record<(typeof SPAN_FIELDS)[number], string> = {
  img_start: 'Img start',
  img_end: 'Img end',
  vol_start: 'Vol start',
  vol_end: 'Vol end',
};

const SegmentCard = memo(function SegmentCard({
  segment,
  value,
  role,
  issueType,
  check,
  dirty,
  edited,
  editable,
  viewing,
  onChange,
  onReset,
  onView,
}: SegmentCardProps) {
  const isIssue = role === 'Issue';
  const border = isIssue
    ? 'border-red-300 bg-red-50/40'
    : role
      ? 'border-blue-300 bg-blue-50/30'
      : 'border-gray-200';
  return (
    <div
      onClick={(e) => {
        if (!(e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLButtonElement)) {
          onView(segment.rid);
        }
      }}
      className={`cursor-pointer rounded-md border p-3 ${border} ${viewing ? 'ring-2 ring-gray-300' : ''}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">{role ?? `Row ${segment.index + 1}`}</span>
        <span className="flex items-center gap-2 text-xs">
          {dirty && <span className="text-amber-700">● unsaved</span>}
          {edited && !dirty && <span className="text-blue-700">edited</span>}
          {edited && editable && (
            <button onClick={() => onReset(segment.rid)} className="cursor-pointer text-gray-500 underline hover:text-gray-800">
              reset
            </button>
          )}
        </span>
      </div>
      <div className="mt-1 break-all font-mono text-xs text-gray-700">{stripBdr(segment.rid)}</div>
      <div className="mt-1 line-clamp-2 font-monlam text-sm leading-relaxed text-gray-900">{segment.title}</div>
      {issueType && <span className="mt-1 inline-block rounded bg-orange-50 px-1.5 py-0.5 text-xs text-orange-700">{issueType}</span>}
      <div className="mt-2 grid grid-cols-2 gap-2">
        {SPAN_FIELDS.map((field) => (
          <label key={field} className="text-xs text-gray-600">
            {FIELD_LABEL[field]}
            <Input
              type="number"
              min={0}
              disabled={!editable}
              value={value[field] ?? ''}
              onChange={(e) => {
                const raw = e.target.value.trim();
                onChange(segment.rid, { ...value, [field]: raw === '' ? null : Number(raw) });
              }}
              className={`mt-0.5 h-8 text-sm ${value[field] !== segment.original[field] ? 'border-blue-400' : ''}`}
            />
          </label>
        ))}
        <label className="col-span-2 text-xs text-gray-600">
          Part type
          <select
            disabled={!editable}
            value={value.part_type ?? ''}
            onChange={(e) => onChange(segment.rid, { ...value, part_type: e.target.value || null })}
            className={`mt-0.5 block h-8 w-full rounded-md border bg-white px-2 text-sm disabled:opacity-50 ${
              value.part_type !== segment.original.part_type ? 'border-blue-400' : 'border-gray-200'
            }`}
          >
            <option value="">— unset —</option>
            {PART_TYPES.map((pt) => (
              <option key={pt.code} value={pt.code}>
                {pt.code} — {pt.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {check && (
        <div className={`mt-2 break-all rounded px-2 py-1 text-xs ${check.status === 'resolved' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {check.status === 'resolved' ? '✔' : check.status === 'unresolved' ? '✖' : '?'} {check.detail}
        </div>
      )}
    </div>
  );
});

function SkipDialog({
  open,
  onOpenChange,
  onSkip,
  busy,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSkip: (note: string) => void;
  readonly busy: boolean;
}) {
  const [note, setNote] = useState('');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Skip this work</DialogTitle>
          <DialogDescription>Say why it can't be fixed, so an admin can follow up. Your saved edits are kept.</DialogDescription>
        </DialogHeader>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. scans missing for volume 4" rows={4} />
        <DialogFooter>
          <Button variant="outline" className="cursor-pointer" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="cursor-pointer" disabled={busy || !note.trim()} onClick={() => onSkip(note.trim())}>
            Skip work
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
