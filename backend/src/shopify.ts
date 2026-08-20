import '@shopify/shopify-api/adapters/node';
import {shopifyApi, LATEST_API_VERSION} from '@shopify/shopify-api';

const {SHOPIFY_API_KEY, SHOPIFY_API_SECRET, SHOPIFY_APP_URL, SCOPES} = process.env;

if (!SHOPIFY_API_KEY || !SHOPIFY_API_SECRET || !SHOPIFY_APP_URL) {
  throw new Error(
    'Missing SHOPIFY_API_KEY, SHOPIFY_API_SECRET or SHOPIFY_APP_URL environment variables',
  );
}

export const shopify = shopifyApi({
  apiKey: SHOPIFY_API_KEY,
  apiSecretKey: SHOPIFY_API_SECRET,
  scopes: (SCOPES ?? 'read_orders,write_orders').split(','),
  hostName: new URL(SHOPIFY_APP_URL).host,
  apiVersion: LATEST_API_VERSION,
  isEmbeddedApp: true,
});
