// @vitest-environment happy-dom
/* Getting back into an account: a forgotten password, the link from the email, a confirmation that never arrived (F-03). */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTH_TEXT as TEXT } from '../../lib/live/auth';
import Login from './Login';

const auth = {
  isSignedIn: vi.fn(async () => false),
  signIn: vi.fn(async () => undefined),
  signUp: vi.fn(async () => false),
  signOut: vi.fn(async () => undefined),
  sendPasswordReset: vi.fn(async () => undefined),
  setNewPassword: vi.fn(async () => undefined),
  resendConfirmation: vi.fn(async () => undefined),
};
const landing = vi.fn(async () => '/acasa');

vi.mock('../../lib/live/index', async () => {
  const real = await vi.importActual<typeof import('../../lib/live/auth')>('../../lib/live/auth');
  return { auth: () => auth, landingPage: () => landing(), safeNext: real.safeNext, linkErrorKey: real.linkErrorKey, authErrorKey: real.authErrorKey };
});

const replace = vi.fn();
const open = async (url: string) => {
  history.replaceState(null, '', url);
  await act(async () => {
    render(<Login />);
  });
  await act(async () => undefined);
};
const button = (name: string) => screen.getByRole('button', { name });
const click = async (name: string) => {
  await act(async () => {
    fireEvent.click(button(name));
  });
};
const fill = (type: string, value: string) => fireEvent.change(document.querySelector(`input[type="${type}"]`)!, { target: { value } });
const submit = async () => {
  await act(async () => {
    fireEvent.submit(document.querySelector('form')!);
  });
  await act(async () => undefined);
};

beforeEach(() => {
  vi.clearAllMocks();
  auth.isSignedIn.mockResolvedValue(false);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const at = (query: string, hash = '') => {
  vi.stubGlobal('location', Object.assign(new URL(`http://app.test/login${query}${hash}`), { replace }));
  return open('/login');
};

describe('A forgotten password', () => {
  it('sends a link that comes back to the new-password form, and says the same whoever asks', async () => {
    await at('');
    await click(TEXT.forgotLink);
    fill('email', 'a@b.ro');
    await submit();
    expect(auth.sendPasswordReset).toHaveBeenCalledWith('a@b.ro', 'http://app.test/login?mode=new-password');
    expect(screen.getByText(TEXT.forgotSent)).toBeTruthy();
  });

  it('shows a refusal', async () => {
    auth.sendPasswordReset.mockRejectedValueOnce({ code: 'over_email_send_rate_limit' });
    await at('');
    await click(TEXT.forgotLink);
    fill('email', 'a@b.ro');
    await submit();
    expect(screen.getByRole('alert').textContent).toBe(TEXT.errors.over_email_send_rate_limit);
  });
});

describe('The link from the email', () => {
  it('asks for the new password instead of entering the app', async () => {
    auth.isSignedIn.mockResolvedValue(true);
    await at('?mode=new-password');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(TEXT.newPasswordTitle);
    expect(replace).not.toHaveBeenCalled();
  });

  it('enters the app after saving it', async () => {
    auth.isSignedIn.mockResolvedValue(true);
    await at('?mode=new-password');
    fill('password', 'parola-noua');
    await submit();
    expect(auth.setNewPassword).toHaveBeenCalledWith('parola-noua');
    expect(replace).toHaveBeenCalledWith('/acasa');
  });

  it('offers a new link when this one has expired', async () => {
    await at('?mode=new-password', '#error=access_denied&error_code=otp_expired');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(TEXT.forgotTitle);
    expect(screen.getByRole('alert').textContent).toBe(TEXT.errors.link_expired);
  });

  it('offers a new link when it opened no session', async () => {
    await at('?mode=new-password');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(TEXT.forgotTitle);
  });
});

describe('Signing in', () => {
  it('still enters the app when already signed in', async () => {
    auth.isSignedIn.mockResolvedValue(true);
    await at('');
    expect(replace).toHaveBeenCalledWith('/acasa');
  });

  it('offers the confirmation email again when it is still waiting', async () => {
    auth.signIn.mockRejectedValueOnce({ code: 'email_not_confirmed' });
    await at('');
    fill('email', 'a@b.ro');
    fill('password', 'parola');
    await submit();
    await click(TEXT.resendButton);
    expect(auth.resendConfirmation).toHaveBeenCalledWith('a@b.ro', 'http://app.test/login');
    expect(screen.getByText(TEXT.resent)).toBeTruthy();
  });

  it('shows the password when asked', async () => {
    await at('');
    await click(TEXT.showPassword);
    expect(document.querySelector('input[type="password"]')).toBeNull();
    expect(button(TEXT.hidePassword).getAttribute('aria-pressed')).toBe('true');
  });
});
