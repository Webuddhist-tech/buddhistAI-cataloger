import { Flag, Users } from 'lucide-react';
import type { AnnotatorAnswer, WitnessCard } from '../api/review';
import { ABSTENTION_LABEL, ISSUE_LABEL, verdictLabel } from '../utils';

const VERDICT_STYLE: Record<string, string> = {
  same: 'bg-green-50 text-green-700 border-green-200',
  different: 'bg-red-50 text-red-700 border-red-200',
};

// Shown to the adjudicator above the texts: why the pair is here. The answers are
// unnamed and in a shuffled order, so the decision rests on the texts, not on who gave them.
export default function AnnotatorAnswers({
  answers,
  a,
  b,
}: Readonly<{ answers: AnnotatorAnswer[]; a: WitnessCard; b: WitnessCard }>) {
  const bothUnsure = answers.length > 0 && answers.every((x) => x.verdict === 'not_sure');
  return (
    <section className="mt-4 rounded-lg border border-indigo-200 bg-indigo-50/60 px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <Users className="h-4 w-4 text-indigo-700" />
        <span className="font-medium text-indigo-900">Annotator answers</span>
        <span className="text-indigo-800/80">
          {bothUnsure ? '— neither annotator could decide.' : '— they did not agree. Your answer is final.'}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
        {answers.map((ans) => (
          <AnswerCard key={ans.label} answer={ans} a={a} b={b} />
        ))}
      </div>
    </section>
  );
}

function AnswerCard({ answer, a, b }: Readonly<{ answer: AnnotatorAnswer; a: WitnessCard; b: WitnessCard }>) {
  const preferred = answer.partner_payload?.preferred_mw_id as string | null | undefined;
  let preferredNote: string | null = null;
  if (answer.verdict === 'same' && preferred !== undefined) {
    if (preferred === null) preferredNote = 'No preferred copy';
    else preferredNote = preferred === a.mw_id ? 'A is the better copy' : preferred === b.mw_id ? 'B is the better copy' : null;
  }
  return (
    <div className="rounded-md border border-white bg-white px-3 py-2.5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-gray-500">{answer.label}</span>
        {answer.confidence != null && (
          <span className="text-xs tabular-nums text-gray-500" title="Confidence, 1 to 5">
            confidence {answer.confidence}/5
          </span>
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full border px-2.5 py-0.5 text-sm font-medium ${
            (answer.verdict && VERDICT_STYLE[answer.verdict]) || 'border-gray-200 bg-gray-50 text-gray-800'
          }`}
        >
          {answer.verdict === 'not_sure' ? "Can't answer" : answer.verdict ? verdictLabel(answer.verdict) : '—'}
        </span>
        {answer.abstention_reason && (
          <span className="text-sm text-gray-600">
            {ABSTENTION_LABEL[answer.abstention_reason] ?? answer.abstention_reason}
          </span>
        )}
        {preferredNote && <span className="text-sm text-gray-600">· {preferredNote}</span>}
      </div>
      {answer.issues && answer.issues.length > 0 && (
        <ul className="mt-2 space-y-1">
          {answer.issues.map((i, n) => (
            <li key={`${i.kind}-${n}`} className="flex items-start gap-1.5 text-xs text-amber-800">
              <Flag className="mt-0.5 h-3 w-3 shrink-0" />
              <span>
                {ISSUE_LABEL[i.kind] ?? i.kind}
                {i.note ? <span className="text-amber-700/80"> — {i.note}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
