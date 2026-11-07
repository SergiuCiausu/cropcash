import path from 'node:path';

export const ROOT = path.resolve(import.meta.dirname, '..');
export const SPEC_PATH = path.resolve(ROOT, '..', 'subventii-surse.md');
export const REPORTS_DIR = path.join(ROOT, 'reports');

function loadEnv(): void {
  try {
    process.loadEnvFile(path.join(ROOT, '.env'));
  } catch {
    // No .env file: values may come from the environment instead.
  }
}

export function loadUserAgent(): string {
  loadEnv();
  const contact = process.env.CONTACT_EMAIL?.trim();
  if (!contact || !contact.includes('@') || contact === 'you@example.com') {
    throw new Error('Set CONTACT_EMAIL in .env (see .env.example). The spec requires a contact in the User-Agent.');
  }
  return `subventii-monitor/0.1 (+mailto:${contact})`;
}

export function loadSupabase(): { url: string; secretKey: string } {
  loadEnv();
  const url = process.env.SUPABASE_URL?.trim();
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !secretKey) {
    throw new Error('Set SUPABASE_URL and SUPABASE_SECRET_KEY in .env (see .env.example).');
  }
  return { url, secretKey };
}
