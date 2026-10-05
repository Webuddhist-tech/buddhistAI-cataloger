import type { Annotator } from '../api/review';
import { answerGroups, formatNumber } from '../utils';

/** How many pairs a person answered with each option (their own latest answer), as
 * badges. `all` also shows options with 0. */
export default function AnswerCounts({ a, all = false }: Readonly<{ a: Pick<Annotator, 'answers'>; all?: boolean }>) {
  const groups = answerGroups(a.answers).filter((g) => all || g.n > 0);
  if (groups.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {groups.map((g) => (
        <span key={g.label} className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${g.badge}`} title={g.detail}>
          {g.label} <strong className="tabular-nums">{formatNumber(g.n)}</strong>
        </span>
      ))}
    </span>
  );
}
