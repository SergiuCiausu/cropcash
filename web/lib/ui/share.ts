/* Handing something to the rest of the phone: its share menu, the clipboard, a file or the printer.
   Nothing here needs internet; what happens next depends on the app the farmer picks. */

export type Sent = 'sent' | 'cancelled' | 'failed';

const wasCancelled = (e: unknown) => (e as { name?: string } | null)?.name === 'AbortError';

export const canShareText = () => typeof navigator !== 'undefined' && typeof navigator.share === 'function';

export async function shareText(title: string, text: string): Promise<Sent> {
  try {
    await navigator.share({ title, text });
    return 'sent';
  } catch (e) {
    return wasCancelled(e) ? 'cancelled' : 'failed';
  }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

const PRINT_ID = 'print-share';

/** Prints only this text: the page and the open sheet stay off the paper. */
export function printText(text: string) {
  document.getElementById(PRINT_ID)?.remove();
  const paper = document.createElement('pre');
  paper.id = PRINT_ID;
  paper.textContent = text;
  document.body.append(paper);
  document.body.classList.add('printing-share');
  addEventListener(
    'afterprint',
    () => {
      paper.remove();
      document.body.classList.remove('printing-share');
    },
    { once: true },
  );
  window.print();
}

function download(file: File) {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** The phone's share menu when it takes files, otherwise a download. */
export async function saveCalendarFile(name: string, ics: string, title: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = new File([ics], name, { type: 'text/calendar' });
  let shareable = false;
  try {
    shareable = !!navigator.canShare?.({ files: [file] });
  } catch {
    /* Older browsers throw on files. */
  }
  if (shareable) {
    try {
      await navigator.share({ files: [file], title });
      return 'shared';
    } catch (e) {
      if (wasCancelled(e)) return 'cancelled';
    }
  }
  download(file);
  return 'downloaded';
}
