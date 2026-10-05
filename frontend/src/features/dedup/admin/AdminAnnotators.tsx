import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import type { Annotator } from '../api/review';
import { useAnnotators } from '../hooks/useReview';
import { ANSWER_GROUPS, answerGroups, formatDateTime, formatDuration } from '../utils';
import InfoTip from './InfoTip';

export default function AdminAnnotators() {
  const annotators = useAnnotators();
  const navigate = useNavigate();
  const open = (a: Annotator) => navigate(`/dedup-admin/annotators/${encodeURIComponent(a.user_id)}`);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Annotators</h1>
          <p className="mt-1 text-sm text-gray-600">Open a person to see their pairs or move unfinished ones.</p>
        </div>
        {/* What the colours in "Answered" mean: always in sight, since hover does not work on phones. */}
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600" aria-label="Answer colours">
          {ANSWER_GROUPS.map((g) => (
            <li key={g.label} className="inline-flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-full ${g.bar}`} /> {g.label}
            </li>
          ))}
          <li className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-gray-200" /> Not answered yet
          </li>
        </ul>
      </div>

      {annotators.error && (
        <div className="mt-6 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Could not load annotators: {annotators.error.message}
        </div>
      )}
      {annotators.isLoading && <div className="mt-6 h-40 animate-pulse rounded-xl bg-gray-100" />}
      {annotators.data?.length === 0 && (
        <p className="mt-6 rounded-lg border border-gray-200 bg-white py-10 text-center text-sm text-gray-500">
          Nobody can use the Deduplicator yet. Give the “dedup” permission in Admin → Users.
        </p>
      )}

      {/* Phones and tablets */}
      <ul className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:hidden">
        {annotators.data?.map((a) => (
          <li key={a.user_id}>
            <button
              onClick={() => open(a)}
              className="w-full cursor-pointer rounded-lg border border-gray-200 bg-white p-4 text-left shadow-sm active:bg-gray-50"
            >
              <Person a={a} />
              <div className="mt-3">
                <Progress a={a} />
              </div>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
                <span>{a.in_progress} opened</span>
                <span>{a.not_started} not opened</span>
                <span>{formatDuration(a.total_active_seconds)} in total</span>
                <span>~{formatDuration(a.avg_active_seconds)} per pair</span>
                <span>Agreed {agreement(a)}</span>
                {a.adjudicated > 0 && <span>{a.adjudicated} adjudicated</span>}
                <span>Active {formatDateTime(a.last_active)}</span>
              </div>
            </button>
          </li>
        ))}
      </ul>

      {/* Laptops and up */}
      {annotators.data && annotators.data.length > 0 && (
        <div className="mt-6 hidden overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm lg:block">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-500">
              <tr>
                <th className="rounded-tl-lg px-4 py-3 font-medium">Annotator</th>
                <th className="px-3 py-3 font-medium">
                  <span className="inline-flex items-center gap-1">
                    Answered
                    <InfoTip text="Pairs answered out of those given, and how many with each option (their own latest answer per pair; a changed answer counts once)." />
                  </span>
                </th>

                <th className="px-3 py-3 text-right font-medium">
                  <span className="inline-flex items-center gap-1">
                    Opened <InfoTip text="Opened but not answered yet." />
                  </span>
                </th>
                <th className="px-3 py-3 text-right font-medium">Not opened</th>
                <th className="px-3 py-3 text-right font-medium">
                  <span className="inline-flex items-center gap-1">
                    Total time
                    <InfoTip
                      text="Time spent working on pairs: counted only while a pair is on screen and in use. Leaving the tab or 5 minutes without any activity pauses it."
                    />
                  </span>
                </th>
                <th className="px-3 py-3 text-right font-medium">
                  <span className="inline-flex items-center gap-1">
                    Per pair
                    <InfoTip text="Average working time per answered pair, including any return visits." />
                  </span>
                </th>
                <th className="px-3 py-3 text-right font-medium">
                  <span className="inline-flex items-center gap-1">
                    Agreement
                    <InfoTip text="Of the pairs this person and their partner both answered, how many they answered the same. Low agreement can mean the person needs help, or that the pairs were hard." />
                  </span>
                </th>
                <th className="px-3 py-3 text-right font-medium">
                  <span className="inline-flex items-center gap-1">
                    Adjudicated <InfoTip text="Disputed pairs this person settled as adjudicator." />
                  </span>
                </th>
                <th className="px-3 py-3 font-medium">Last active</th>
                <th className="w-8 rounded-tr-lg px-3 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {annotators.data.map((a) => (
                <tr key={a.user_id} onClick={() => open(a)} className="cursor-pointer hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Person a={a} />
                  </td>
                  <td className="w-56 px-3 py-3">
                    <Progress a={a} />
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-amber-700">{a.in_progress}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-gray-600">{a.not_started}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">
                    {formatDuration(a.total_active_seconds || null)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{formatDuration(a.avg_active_seconds)}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{agreement(a)}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-gray-600">{a.adjudicated || '—'}</td>
                  <td className="px-3 py-3 text-xs text-gray-500">
                    <LastActive iso={a.last_active} />
                  </td>
                  <td className="px-3 py-3 text-right">
                    <ArrowRight className="ml-auto h-4 w-4 text-blue-700" aria-label={`Open ${a.name || a.email}`} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Date on one line, time on the next, so the column stays narrow. */
function LastActive({ iso }: Readonly<{ iso: string | null }>) {
  if (!iso) return <>—</>;
  const d = new Date(iso.endsWith('Z') || iso.includes('+') ? iso : `${iso}Z`);
  return (
    <span title={formatDateTime(iso)} className="whitespace-nowrap">
      {d.toLocaleDateString(undefined, { dateStyle: 'medium' })}
      <br />
      {d.toLocaleTimeString(undefined, { timeStyle: 'short' })}
    </span>
  );
}

/** "8 of 10 (80%)", or "—" before any pair has both answers. */
function agreement(a: Annotator): string {
  if (!a.paired) return '—';
  return `${a.agreed} of ${a.paired} (${Math.round((a.agreed / a.paired) * 100)}%)`;
}

// Answered out of given, as one bar split by answer (same, different, …); the light
// rest is not answered yet. One line below names the counts in the same colours.
function Progress({ a }: Readonly<{ a: Annotator }>) {
  const groups = answerGroups(a.answers).filter((g) => g.n > 0);
  const total = Math.max(a.assigned, groups.reduce((s, g) => s + g.n, 0));
  const hover = groups.map((g) => `${g.label}: ${g.n}${g.detail ? ` (${g.detail})` : ''}`).join('\n');
  return (
    <div title={hover || undefined}>
      <div className="text-sm text-gray-700">
        <strong className="tabular-nums text-gray-900">{a.done}</strong> of <span className="tabular-nums">{a.assigned}</span>
      </div>
      <div className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-gray-100" aria-hidden="true">
        {groups.map((g) => (
          <span key={g.label} className={`h-full ${g.bar}`} style={{ width: `${(g.n / (total || 1)) * 100}%` }} />
        ))}
      </div>
      {groups.length > 0 && (
        // Colour + dot per number; names are in the legend above the table and on hover.
        <div className="mt-1 flex flex-wrap gap-x-2.5 text-xs">
          {groups.map((g) => (
            <span key={g.label} className={`inline-flex items-center gap-1 ${g.text}`}>
              <span className={`h-2 w-2 rounded-full ${g.bar}`} aria-hidden="true" />
              <span className="tabular-nums font-medium">{g.n}</span>
              <span className="sr-only">{g.label}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function Person({ a }: Readonly<{ a: Pick<Annotator, 'name' | 'email' | 'picture' | 'has_access'> & { role?: string | null } }>) {
  const initial = (a.name || a.email || '?').charAt(0).toUpperCase();
  return (
    <div className="flex min-w-0 items-center gap-3">
      {a.picture ? (
        <img src={a.picture} alt="" className="h-8 w-8 shrink-0 rounded-full" referrerPolicy="no-referrer" />
      ) : (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-200 text-sm font-medium text-gray-700">
          {initial}
        </span>
      )}
      <div className="min-w-0">
        <div className="truncate font-medium text-gray-900">{a.name || a.email}</div>
        <div className="flex items-center gap-2 truncate text-xs text-gray-500">
          {a.name && <span className="truncate">{a.email}</span>}
          {a.role === 'reviewer' && (
            <span className="shrink-0 rounded-full bg-indigo-50 px-2 py-0.5 font-medium text-indigo-700">Adjudicator</span>
          )}
          {!a.has_access && (
            <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 font-medium text-red-700">access removed</span>
          )}
        </div>
      </div>
    </div>
  );
}
