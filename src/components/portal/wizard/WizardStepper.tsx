"use client";

export interface WizardStep {
  id: string;
  label: string;
  shortLabel?: string;
}

interface Props {
  steps: WizardStep[];
  current: number;
  className?: string;
}

export function WizardStepper({ steps, current, className = "" }: Props) {
  const pct = Math.round(((current + 1) / steps.length) * 100);

  return (
    <nav
      aria-label="Pasos del formulario"
      className={className}
    >
      {/* Mobile: barra de progreso + label */}
      <div className="sm:hidden">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-medium text-slate-700">
            {steps[current]?.label}
          </span>
          <span className="text-slate-400" aria-hidden="true">
            {current + 1} / {steps.length}
          </span>
        </div>
        <div
          role="progressbar"
          aria-valuenow={current + 1}
          aria-valuemin={1}
          aria-valuemax={steps.length}
          aria-label={`Paso ${current + 1} de ${steps.length}: ${steps[current]?.label ?? ""}`}
          className="h-1.5 overflow-hidden rounded-full bg-slate-100"
        >
          <div
            className="h-full rounded-full bg-emerald-500 transition-all duration-500 motion-reduce:transition-none"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Desktop: lista de pasos */}
      <ol className="hidden sm:flex items-center" aria-label="Pasos del formulario">
        {steps.map((step, idx) => {
          const isDone = idx < current;
          const isCurrent = idx === current;

          return (
            <li key={step.id} className="flex items-center">
              {/* Conector entre pasos */}
              {idx > 0 && (
                <div
                  className={`mx-2 h-px w-8 transition-colors duration-300 motion-reduce:transition-none lg:w-12 ${
                    isDone ? "bg-emerald-400" : "bg-slate-200"
                  }`}
                  aria-hidden="true"
                />
              )}

              {/* Círculo del paso */}
              <div className="flex flex-col items-center gap-1">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-all duration-300 motion-reduce:transition-none ${
                    isDone
                      ? "bg-emerald-500 text-white"
                      : isCurrent
                        ? "border-2 border-emerald-500 bg-white text-emerald-700"
                        : "border-2 border-slate-200 bg-white text-slate-400"
                  }`}
                  aria-current={isCurrent ? "step" : undefined}
                >
                  {isDone ? (
                    <>
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3} aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="sr-only">Completado</span>
                    </>
                  ) : (
                    idx + 1
                  )}
                </div>
                <span
                  className={`max-w-[5rem] text-center text-xs leading-tight ${
                    isCurrent ? "font-semibold text-slate-800" : "text-slate-400"
                  }`}
                >
                  {step.shortLabel ?? step.label}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
