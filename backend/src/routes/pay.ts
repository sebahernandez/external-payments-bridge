import {Router} from 'express';
import {db} from '../db.js';
import {confirmChargeAndMarkOrderPaid} from '../services/charges.js';

export const payRouter = Router();

const MAX_POLL_ATTEMPTS = 15;
const POLL_INTERVAL_MS = 2000;

const STYLES = `
  :root {
    --bg: #f4f2ee;
    --card: #ffffff;
    --border: #e5e1d8;
    --text: #211d17;
    --text-2: #6b6355;
    --accent: #145c4b;
    --accent-ink: #ffffff;
    --warn: #a8710a;
    --warn-bg: #f6ecd7;
    --danger: #b3261e;
    --danger-bg: #f7e3e1;
    --ok-bg: #e2efe9;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #17140f;
      --card: #211d17;
      --border: #3a3327;
      --text: #f2ede4;
      --text-2: #b3aa9a;
      --accent: #4fd1b5;
      --accent-ink: #0d1f1a;
      --warn: #e0b34d;
      --warn-bg: #332a16;
      --danger: #e18c85;
      --danger-bg: #33201d;
      --ok-bg: #1c332a;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: var(--bg);
    color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    line-height: 1.5;
  }
  .card {
    width: 100%;
    max-width: 420px;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 32px 28px;
  }
  .eyebrow {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12.5px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-2);
    margin-bottom: 14px;
  }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--accent); flex: none; }
  h1 {
    font-size: 22px;
    font-weight: 650;
    margin: 0 0 8px;
    letter-spacing: -0.01em;
    text-wrap: balance;
  }
  p { margin: 0 0 12px; color: var(--text-2); font-size: 14.5px; }
  .order-line {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding: 14px 0;
    margin: 16px 0;
    border-top: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
  }
  .order-line .name { color: var(--text); font-weight: 600; font-size: 14.5px; }
  .order-line .amount {
    font-variant-numeric: tabular-nums;
    font-weight: 650;
    font-size: 17px;
  }
  .note { font-size: 13.5px; }
  button, .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    padding: 13px 20px;
    font-size: 15px;
    font-weight: 600;
    border-radius: 9px;
    border: none;
    background: var(--accent);
    color: var(--accent-ink);
    cursor: pointer;
    text-decoration: none;
    margin-top: 4px;
  }
  button:hover, .btn:hover { filter: brightness(1.08); }
  button:focus-visible, .btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .banner {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 12px 14px;
    border-radius: 10px;
    font-size: 13.5px;
    margin-bottom: 16px;
  }
  .banner.warn { background: var(--warn-bg); color: var(--warn); }
  .banner.danger { background: var(--danger-bg); color: var(--danger); }
  .banner.ok { background: var(--ok-bg); color: var(--accent); }
  .spinner {
    width: 18px; height: 18px; flex: none;
    border: 2.5px solid currentColor;
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .spinner { animation: none; } }
  .retry { color: var(--accent); font-weight: 600; font-size: 14px; }
`;

function shell(inner: string) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Completá tu pago</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>${STYLES}</style></head>
<body><main class="card">${inner}</main></body></html>`;
}

function eyebrow(label: string) {
  return `<div class="eyebrow"><span class="dot"></span>${label}</div>`;
}

function storeButton(shop: string) {
  return `<a class="btn" href="https://${shop}">Volver a la tienda</a>`;
}

payRouter.get('/pay', async (req, res) => {
  const orderId = req.query.order;
  if (typeof orderId !== 'string') {
    res.status(400).send(shell(`${eyebrow('Pago')}<h1>Falta el pedido</h1><p>Este link no incluye un pedido válido.</p>`));
    return;
  }

  const attempt = Number(req.query.attempt) || 0;

  // The Thank You page hands us an OrderIdentity GID
  // (gid://shopify/OrderIdentity/123), while we store the Order GID
  // (gid://shopify/Order/123) from the orders/create webhook — same
  // trailing numeric id, different resource type. Match on that suffix.
  const numericId = orderId.match(/(\d+)$/)?.[1];
  const charge = await db.charge.findFirst({
    where: numericId ? {shopifyOrderId: {endsWith: `/${numericId}`}} : {shopifyOrderId: orderId},
    orderBy: {createdAt: 'desc'},
  });

  if (!charge) {
    if (attempt < MAX_POLL_ATTEMPTS) {
      const nextUrl = `/pay?order=${encodeURIComponent(orderId)}&attempt=${attempt + 1}`;
      res.send(
        shell(`
          ${eyebrow('Pago')}
          <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 10px;">
            <div class="spinner" style="color: var(--accent);"></div>
            <h1 style="margin: 0;">Estamos preparando tu pago…</h1>
          </div>
          <p>Esto puede tardar unos segundos mientras confirmamos tu pedido con la tienda.</p>
          <script>setTimeout(() => { window.location.href = ${JSON.stringify(nextUrl)}; }, ${POLL_INTERVAL_MS});</script>
        `),
      );
      return;
    }
    res.status(404).send(
      shell(`
        ${eyebrow('Pago')}
        <div class="banner warn">Todavía no encontramos un pago pendiente para este pedido.</div>
        <a class="retry" href="/pay?order=${encodeURIComponent(orderId)}">Reintentar →</a>
      `),
    );
    return;
  }

  if (charge.status === 'PAID') {
    res.send(
      shell(`
        ${eyebrow('Pago confirmado')}
        <h1>¡Listo!</h1>
        <div class="order-line">
          <span class="name">${charge.shopifyOrderName}</span>
          <span class="amount">${charge.amount} ${charge.currency}</span>
        </div>
        <p>Este pedido ya está pagado. ¡Gracias!</p>
        ${storeButton(charge.shop)}
      `),
    );
    return;
  }

  res.send(
    shell(`
      ${eyebrow('Completá tu pago')}
      <h1>Falta un paso</h1>
      <div class="order-line">
        <span class="name">${charge.shopifyOrderName}</span>
        <span class="amount">${charge.amount} ${charge.currency}</span>
      </div>
      <p class="note">${(charge.paymentInstructions as any)?.note ?? ''}</p>
      <form method="post" action="/pay/${charge.id}/confirm">
        <button type="submit">Ya pagué — confirmar</button>
      </form>
    `),
  );
});

payRouter.post('/pay/:chargeId/confirm', async (req, res) => {
  const charge = await confirmChargeAndMarkOrderPaid(req.params.chargeId);

  if (charge.status === 'PAID') {
    res.send(
      shell(`
        ${eyebrow('Pago confirmado')}
        <h1>¡Gracias!</h1>
        <div class="order-line">
          <span class="name">${charge.shopifyOrderName}</span>
          <span class="amount">${charge.amount} ${charge.currency}</span>
        </div>
        <p>Ya quedó marcado como pagado en Shopify.</p>
        ${storeButton(charge.shop)}
      `),
    );
    return;
  }

  res.status(422).send(
    shell(`
      ${eyebrow('Pago')}
      <h1>No pudimos confirmar este pago</h1>
      <div class="banner danger">${charge.errorMessage ?? 'Contactá a soporte.'}</div>
    `),
  );
});
