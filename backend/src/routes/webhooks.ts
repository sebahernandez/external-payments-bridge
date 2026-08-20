import {Router, raw} from 'express';
import {shopify} from '../shopify.js';

export const webhooksRouter = Router();

// Shopify signs the raw body with HMAC; must stay unparsed until shopify-api verifies it.
webhooksRouter.post('/webhooks', raw({type: '*/*'}), async (req, res) => {
  try {
    await shopify.webhooks.process({
      rawBody: req.body.toString('utf8'),
      rawRequest: req,
      rawResponse: res,
    });
  } catch (error) {
    console.error('Webhook processing failed', error);
    if (!res.headersSent) res.status(500).send('error');
  }
});
