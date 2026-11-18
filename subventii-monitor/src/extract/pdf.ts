import { extractText, getDocumentProxy } from 'unpdf';

/** Returns the PDF's text, or '' for scanned, encrypted or damaged files. */
export async function extractPdf(body: Uint8Array): Promise<string> {
  try {
    // pdf.js takes ownership of the buffer, so it gets a copy.
    const pdf = await getDocumentProxy(new Uint8Array(body), { verbosity: 0 });
    const { text } = await extractText(pdf, { mergePages: false });
    return text.join('\n');
  } catch {
    return '';
  }
}

export function isPdf(body: Uint8Array): boolean {
  return Buffer.from(body.subarray(0, 1024)).includes('%PDF-');
}
