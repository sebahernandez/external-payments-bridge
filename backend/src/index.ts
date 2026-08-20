import 'dotenv/config';
import express from 'express';
import {shopify} from './shopify.js';
import {webhookHandlers} from './webhook-handlers.js';
import {webhooksRouter} from './routes/webhooks.js';
import {payRouter} from './routes/pay.js';
import {merchantConfigRouter} from './routes/merchant-config.js';
import {chargesRouter} from './routes/charges.js';

shopify.webhooks.addHandlers(webhookHandlers as any);

const app = express();

// Must be mounted before any body parser: webhook route needs the raw body for HMAC verification.
app.use(webhooksRouter);

app.use(payRouter);
app.use(merchantConfigRouter);
app.use(chargesRouter);

app.get('/health', (_req, res) => res.json({ok: true}));

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  console.log(`Backend listening on :${port}`);
});
