import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { t } from '../i18n';

export function PrimaryButton({ className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`w-full rounded-2xl bg-field-700 px-6 py-5 text-2xl font-semibold text-white active:bg-field-900 disabled:opacity-50 ${className}`}
    />
  );
}

export function SecondaryButton({ className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`rounded-2xl border-2 border-field-700 px-5 py-4 text-xl text-field-700 active:bg-field-600/10 ${className}`}
    />
  );
}

/** Full-height mobile screen with optional back button and step indicator. */
export function Screen({
  children,
  onBack,
  step,
  footer,
}: {
  children: ReactNode;
  onBack?: () => void;
  step?: { n: number; total: number };
  footer?: ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-4 pb-6 pt-4">
      {(onBack || step) && (
        <div className="mb-4 flex min-h-12 items-center justify-between">
          {onBack ? (
            <button onClick={onBack} className="-ml-2 px-2 py-3 text-lg text-field-700">
              ← {t('common.back')}
            </button>
          ) : (
            <span />
          )}
          {step && (
            <span className="text-base text-field-900/70">{t('onboarding.step', { n: step.n, total: step.total })}</span>
          )}
        </div>
      )}
      <main className="flex flex-1 flex-col gap-5">{children}</main>
      {footer && <div className="sticky bottom-0 mt-6 bg-field-50 pt-2">{footer}</div>}
    </div>
  );
}

export function Alert({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-xl bg-red-100 px-4 py-3 text-lg text-red-900">
      {children}
    </p>
  );
}

export function VerifyBadge() {
  return (
    <span
      title={t('common.toVerifyHint')}
      className="ml-2 inline-block rounded-full bg-amber-100 px-2 py-0.5 align-middle text-sm text-amber-900"
    >
      {t('common.toVerify')}
    </span>
  );
}
