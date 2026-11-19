import express, { Router, type NextFunction, type Request, type Response } from 'express';
import {
  ReadDocumentInputSchema,
  filesProblem,
  normalizeContractPaper,
  normalizeReading,
  todayInRomania,
  type AppData,
  type DocumentFile,
} from '@cropcash/shared';
import type { ContractReader } from '../ai/contract';
import type { DocumentReader } from '../ai/documents';
import { requireAuth, type TokenVerifier } from '../middleware/auth';
import { ReplayCache, requestKey } from '../replay-cache';

const BASE64_GROWTH = 4 / 3;
const ROOM_FOR_THE_JSON_MB = 1;

interface DocumentsDeps {
  verifyToken: TokenVerifier;
  read?: DocumentReader;
  /** Contract papers (docs/contracts-plan.md step 8). Without it, /documents/read-contract answers reader_off. */
  readContract?: ContractReader;
  data: AppData;
  now: () => Date;
}

/**
 * Reads a paper and returns the fields, saving nothing. The file is held only for this request and
 * is never logged. It needs a session but no farm, because onboarding uses it before one exists.
 */
export function documentsRouter({ verifyToken, read, readContract, data, now }: DocumentsDeps): Router {
  const r = Router();
  const limits = data.params.documents;
  const parse = express.json({ limit: `${Math.ceil(limits.max_mb.value * BASE64_GROWTH) + ROOM_FOR_THE_JSON_MB}mb` });
  const used = new Map<string, { day: string; reads: number }>();
  /* The same paper sent again within 10 minutes (a tap after a 502, a second tab) gets the reading
     already paid for, and doesn't count against the day (IDEM-13). Only the hash of the files and
     the fields read are kept, never the paper itself. Every kind of paper shares the day's reads. */
  type Outcome<T> = { reading: T } | { unreadable: true };

  /** Checks the files and the day's reads, reads each paper once, answers. The reader returning null: unreadable (422). */
  function readRoute<T>(reader: ((files: DocumentFile[]) => Promise<T | null>) | undefined) {
    const readings = new ReplayCache<Outcome<T>>(10 * 60 * 1000);
    return async (req: Request, res: Response) => {
      if (!reader) {
        res.status(503).json({ error: 'reader_off' });
        return;
      }
      const parsed = ReadDocumentInputSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'invalid_input' });
        return;
      }
      const problem = filesProblem(parsed.data.files, data);
      if (problem) {
        res.status(problem === 'bad_file' ? 400 : 413).json({ error: problem });
        return;
      }
      const { userId } = res.locals.auth;
      const key = requestKey(userId, parsed.data.files);
      const kept = readings.get(key);
      if (!kept) {
        const day = todayInRomania(now());
        const seen = used.get(userId);
        const reads = seen?.day === day ? seen.reads : 0;
        if (reads >= limits.reads_per_day.value) {
          res.status(429).json({ error: 'too_many_reads' });
          return;
        }
        used.set(userId, { day, reads: reads + 1 });
      }

      try {
        const outcome = await (kept ??
          readings.run(key, async (): Promise<Outcome<T>> => {
            const reading = await reader(parsed.data.files);
            return reading ? { reading } : { unreadable: true };
          }));
        if ('unreadable' in outcome) {
          res.status(422).json({ error: 'unreadable' });
          return;
        }
        res.json(outcome.reading);
      } catch (err) {
        // Only the status: an error object can carry the request, and this one holds the farmer's paper.
        console.error('[documents] read failed', (err as { status?: number }).status ?? 'no status');
        res.status(502).json({ error: 'read_failed' });
      }
    };
  }

  r.post(
    '/documents/read',
    requireAuth(verifyToken),
    parse,
    readRoute(read && (async (files: DocumentFile[]) => {
      const raw = await read(files);
      return raw ? normalizeReading(raw, data, todayInRomania(now())) : null;
    })),
  );
  /** A contract's paper (step 8): what it says, every value checked, for the farmer to confirm field by field. */
  r.post(
    '/documents/read-contract',
    requireAuth(verifyToken),
    parse,
    readRoute(readContract && (async (files: DocumentFile[]) => {
      const raw = await readContract(files);
      return raw ? normalizeContractPaper(raw, data) : null;
    })),
  );

  // A parse error carries the body it failed on, so these never reach the logging handler.
  r.use((err: { type?: string }, _req: Request, res: Response, next: NextFunction) => {
    if (err.type === 'entity.too.large') res.status(413).json({ error: 'too_large' });
    else if (err.type === 'entity.parse.failed') res.status(400).json({ error: 'invalid_input' });
    else next(err);
  });

  return r;
}
