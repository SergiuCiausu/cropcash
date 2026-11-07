import express, { Router } from 'express';
import type Stripe from 'stripe';
import type { StripeGateway } from '../stripe/gateway';
import type { Ledger } from '../stripe/ledger';

const INCOME = new Set(['apia_advance', 'apia_balance', 'crop_sale']);

async function handle(event: Stripe.Event, ledger: Ledger) {
  switch (event.type) {
    // Not transfer.created: a destination charge's transfer has no metadata (docs/08 §3).
    case 'payment_intent.succeeded': {
      const intent = event.data.object;
      const { farmer_id: farmerId, kind, crop_id: cropId } = intent.metadata;
      if (!farmerId || !kind || !INCOME.has(kind)) return;
      await ledger.applyIncome({
        farmerId,
        amountBani: intent.amount,
        at: new Date(intent.created * 1000).toISOString(),
        category: kind,
        cropId,
        objectId: intent.id,
      });
      return;
    }
    case 'payout.paid':
      await ledger.payoutPaid(event.data.object.id);
      return;
    case 'payout.failed':
      await ledger.payoutFailed(event.data.object.id);
      return;
    case 'invoice.paid': {
      const invoice = event.data.object;
      const customer = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
      if (!customer || !invoice.id || invoice.amount_paid <= 0) return;
      const farm = await ledger.farmByCustomer(customer);
      if (!farm) return;
      const paidAt = invoice.status_transitions.paid_at ?? invoice.created;
      await ledger.invoicePaid(farm.id, invoice.amount_paid, new Date(paidAt * 1000).toISOString(), invoice.id);
      return;
    }
  }
}

/** Mounted before express.json(): the signature covers the raw body. */
export function webhooksRouter(gateway: StripeGateway, ledger: Ledger): Router {
  const r = Router();

  r.post('/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
    let event: Stripe.Event;
    try {
      event = gateway.parseEvent(req.body as Buffer, req.get('stripe-signature') ?? '');
    } catch {
      res.status(400).json({ error: 'bad_signature' });
      return;
    }
    if (event.livemode) {
      res.status(400).json({ error: 'live_event' });
      return;
    }
    // A failure answers 500, so Stripe sends it again. Repeating is safe.
    await handle(event, ledger);
    res.json({ received: true });
  });

  return r;
}
