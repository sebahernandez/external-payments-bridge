import {useState, useEffect} from 'preact/hooks';
import {useLocation, useRoute} from 'preact-iso';
import {authorizedJson, errorMessage} from '../lib/api.js';

const STATUS_LABEL = {
  PENDING: 'Pendiente',
  PROCESSING: 'Procesando',
  NEEDS_REVIEW: 'Requiere revisión',
  PAID: 'Pagado',
  FAILED: 'Fallido',
  CANCELLED: 'Rechazado',
  EXPIRED: 'Expirado',
};

const STATUS_TONE = {
  PENDING: 'auto',
  PROCESSING: 'auto',
  NEEDS_REVIEW: 'warning',
  PAID: 'success',
  FAILED: 'critical',
  CANCELLED: 'critical',
  EXPIRED: 'caution',
};

function BackLink({route}) {
  return (
    <s-link
      href="/"
      onClick={(event) => {
        event.preventDefault();
        route('/');
      }}
    >
      ← Pagos
    </s-link>
  );
}

export default function ChargeDetailPage() {
  const {params} = useRoute();
  const {route} = useLocation();
  const [charge, setCharge] = useState(/** @type {any|null} */ (null));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(/** @type {string|null} */ (null));
  const [working, setWorking] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await authorizedJson(`/api/charges/${params.id}`);
      setCharge(data.charge);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [params.id]);

  async function onApprove() {
    setWorking(true);
    setError(null);
    try {
      const data = await authorizedJson(`/api/charges/${params.id}/approve`, {method: 'POST'});
      setCharge(data.charge);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setWorking(false);
    }
  }

  async function onReject() {
    if (!rejectReason.trim()) {
      setError('Hace falta un motivo para rechazar el pago.');
      return;
    }
    setWorking(true);
    setError(null);
    try {
      const data = await authorizedJson(`/api/charges/${params.id}/reject`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({reason: rejectReason.trim()}),
      });
      setCharge(data.charge);
      setShowReject(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setWorking(false);
    }
  }

  if (loading) {
    return (
      <s-page heading="Pago">
        <s-section>
          <BackLink route={route} />
          <s-paragraph>Cargando…</s-paragraph>
        </s-section>
      </s-page>
    );
  }

  if (!charge) {
    return (
      <s-page heading="Pago">
        <s-section>
          <BackLink route={route} />
          <s-banner tone="critical">No se pudo cargar este pago: {error}</s-banner>
        </s-section>
      </s-page>
    );
  }

  const canDecide = charge.status === 'PENDING' || charge.status === 'NEEDS_REVIEW';

  /** @param {Event} event */
  function onReasonChange(event) {
    setRejectReason(/** @type {HTMLTextAreaElement} */ (event.currentTarget).value);
  }

  return (
    <s-page heading={charge.shopifyOrderName}>
      <s-section heading="Detalle">
        <BackLink route={route} />
        <s-stack direction="block" gap="base">
          <s-paragraph>
            <s-text type="strong">Monto: </s-text>
            {charge.amount} {charge.currency}
          </s-paragraph>
          <s-paragraph>
            <s-text type="strong">Estado: </s-text>
            <s-badge tone={STATUS_TONE[charge.status] ?? 'auto'}>
              {STATUS_LABEL[charge.status] ?? charge.status}
            </s-badge>
          </s-paragraph>
          <s-paragraph>
            <s-text type="strong">Proveedor: </s-text>
            {charge.providerId}
          </s-paragraph>
          <s-paragraph>
            <s-text type="strong">Creado: </s-text>
            {new Date(charge.createdAt).toLocaleString('es')}
          </s-paragraph>
          {charge.paidAt && (
            <s-paragraph>
              <s-text type="strong">Pagado: </s-text>
              {new Date(charge.paidAt).toLocaleString('es')}
            </s-paragraph>
          )}
          {charge.reviewedAt && (
            <s-paragraph>
              <s-text type="strong">Revisado: </s-text>
              {new Date(charge.reviewedAt).toLocaleString('es')}
              {charge.reviewNote ? ` — "${charge.reviewNote}"` : ''}
            </s-paragraph>
          )}
          {charge.errorMessage && (
            <s-paragraph>
              <s-text type="strong">Nota: </s-text>
              {charge.errorMessage}
            </s-paragraph>
          )}
        </s-stack>
      </s-section>

      {error && (
        <s-section>
          <s-banner tone="critical">{error}</s-banner>
        </s-section>
      )}

      {canDecide && (
        <s-section heading="Decisión">
          <s-stack direction="block" gap="base">
            <s-button variant="primary" onClick={onApprove} loading={working || undefined}>
              Aprobar — marcar pedido como pagado
            </s-button>

            {!showReject && (
              <s-button tone="critical" onClick={() => setShowReject(true)}>
                Rechazar pago
              </s-button>
            )}

            {showReject && (
              <s-stack direction="block" gap="base">
                <s-text-area
                  label="Motivo del rechazo"
                  value={rejectReason}
                  onChange={onReasonChange}
                  rows={3}
                />
                <s-paragraph>Rechazar cancela el pedido en Shopify y libera el inventario reservado.</s-paragraph>
                <s-button tone="critical" onClick={onReject} loading={working || undefined}>
                  Confirmar rechazo
                </s-button>
              </s-stack>
            )}
          </s-stack>
        </s-section>
      )}
    </s-page>
  );
}
