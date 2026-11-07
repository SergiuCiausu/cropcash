import { t } from './i18n';

export function App() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-2 px-4 text-center">
      <h1 className="text-4xl font-bold text-field-700">{t('app.name')}</h1>
      <p className="text-lg">{t('app.tagline')}</p>
    </main>
  );
}
