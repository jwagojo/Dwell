import type { ReactNode } from 'react';
import { Button } from './ui';

/** Left step rail + white card + footer (spec §4.13). */
export default function Wizard({
  title,
  steps,
  current,
  onStepClick,
  stepTitle,
  stepWhy,
  onBack,
  onNext,
  nextLabel,
  busy = false,
  children,
}: {
  title: string;
  steps: string[];
  /** 0-based */
  current: number;
  onStepClick: (index: number) => void;
  stepTitle: string;
  stepWhy: string;
  onBack: () => void;
  onNext: () => void;
  nextLabel?: string;
  busy?: boolean;
  children: ReactNode;
}) {
  const last = current === steps.length - 1;
  return (
    <div className="flex flex-wrap items-start gap-8">
      <nav aria-label="Steps" className="flex w-full flex-col gap-3 md:w-[240px] md:shrink-0">
        <h1 className="text-[24px] font-semibold text-ink">{title}</h1>
        <ol className="m-0 flex list-none flex-col gap-1 p-0">
          {steps.map((s, i) => {
            const done = i < current;
            const isCurrent = i === current;
            return (
              <li key={s}>
                <button
                  type="button"
                  disabled={!done}
                  aria-current={isCurrent ? 'step' : undefined}
                  onClick={() => onStepClick(i)}
                  className={`flex h-11 w-full items-center gap-3 rounded-card px-2 text-left text-[15px] font-medium ${
                    isCurrent ? 'bg-brand-tint text-brand' : done ? 'text-ink hover:bg-paper' : 'text-muted'
                  }`}
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-medium ${
                      done
                        ? 'bg-brand text-on-ink'
                        : isCurrent
                          ? 'border-2 border-brand bg-paper text-brand'
                          : 'border border-line-strong bg-paper text-muted'
                    }`}
                    aria-hidden="true"
                  >
                    {done ? '✓' : i + 1}
                  </span>
                  <span>
                    {s}
                    {done && <span className="sr-only"> (done)</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="flex min-w-0 flex-[999_1_480px] flex-col gap-6 rounded-card border border-line bg-paper p-5 shadow-panel sm:p-7">
        <div className="flex flex-col gap-1.5">
          <h2 className="text-[26px] font-semibold text-ink">{stepTitle}</h2>
          <p className="text-[16px] text-body">{stepWhy}</p>
        </div>
        <div className="flex flex-col gap-5">{children}</div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
          <div className="min-w-[96px]">
            {current > 0 && (
              <Button variant="secondary" onClick={onBack}>
                Back
              </Button>
            )}
          </div>
          <span className="text-[14px] font-medium text-muted">
            Step {current + 1} of {steps.length}
          </span>
          <Button size="lg" onClick={onNext} disabled={busy}>
            {busy ? 'Publishing…' : (nextLabel ?? (last ? 'Publish listing' : 'Continue'))}
          </Button>
        </div>
      </div>
    </div>
  );
}
