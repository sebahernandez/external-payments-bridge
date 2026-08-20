import {useState, useEffect} from 'preact/hooks';
import {useLocation} from 'preact-iso';
import {authorizedJson, errorMessage} from '../lib/api.js';

const ALL_STATUSES = 'ALL';

const FILTERS = [
  {status: ALL_STATUSES, countKey: 'total', label: 'Todos'},
  {status: 'PENDING,NEEDS_REVIEW', countKey: 'needsAction', label: 'Requiere acción'},
  {status: 'PAID', countKey: 'approved', label: 'Aprobados'},
  {status: 'CANCELLED', countKey: 'rejected', label: 'Rechazados'},
  {status: 'FAILED,EXPIRED', countKey: 'failed', label: 'Fallidos'},
];

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

export default function ChargesPage() {
  const {route} = useLocation();
  const [filter, setFilter] = useState(FILTERS[0].status);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [summary, setSummary] = useState(/** @type {Record<string, number>} */ ({}));
  const [charges, setCharges] = useState(/** @type {any[]} */ ([]));
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(/** @type {string|null} */ (null));

  useEffect(() => {
    authorizedJson('/api/charges/summary').then(setSummary).catch(() => {});
  }, []);

  // Debounce free-text search so we're not firing a request on every keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      setSearch(searchInput.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const params = new URLSearchParams({page: String(page)});
        if (filter !== ALL_STATUSES) params.set('status', filter);
        if (search) params.set('q', search);
        const data = await authorizedJson(`/api/charges?${params.toString()}`);
        if (!cancelled) {
          setCharges(data.charges);
          setTotalPages(data.totalPages);
          setTotal(data.total);
        }
      } catch (error) {
        if (!cancelled) setLoadError(errorMessage(error));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filter, search, page]);

  /** @param {Event} event */
  function onFilterChange(event) {
    setPage(1);
    setFilter(/** @type {HTMLSelectElement} */ (event.currentTarget).value);
  }

  /** @param {Event} event */
  function onSearchInput(event) {
    setSearchInput(/** @type {HTMLInputElement} */ (event.currentTarget).value);
  }

  return (
    <s-page heading="Pagos">
      <s-button slot="primary-action" href="/settings">
        Configuración
      </s-button>

      <s-section heading="Pagos manuales">
        <s-paragraph>
          Los pedidos hechos con tu método de pago manual aparecen acá. Aprobá una vez que
          confirmes que el dinero llegó, o rechazá para cancelar el pedido.
        </s-paragraph>

        <s-stack direction="inline" gap="base" alignItems="end">
          <s-select label="Estado" value={filter} onChange={onFilterChange}>
            {FILTERS.map((f) => (
              <s-option key={f.status} value={f.status}>
                {f.label}
                {summary[f.countKey] != null ? ` (${summary[f.countKey]})` : ''}
              </s-option>
            ))}
          </s-select>

          <s-search-field
            label="Buscar pedido"
            placeholder="Ej: #1015"
            value={searchInput}
            onInput={onSearchInput}
          ></s-search-field>
        </s-stack>

        {loadError && <s-banner tone="critical">No se pudieron cargar los pagos: {loadError}</s-banner>}

        {!loading && charges.length === 0 && !loadError && (
          <s-paragraph>No hay pedidos en esta categoría.</s-paragraph>
        )}

        {!loading && charges.length > 0 && (
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">Pedido</s-table-header>
              <s-table-header>Monto</s-table-header>
              <s-table-header>Estado</s-table-header>
              <s-table-header>Creado</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {charges.map((charge) => (
                <s-table-row key={charge.id}>
                  <s-table-cell>
                    <s-link
                      href={`/charges/${charge.id}`}
                      onClick={(event) => {
                        event.preventDefault();
                        route(`/charges/${charge.id}`);
                      }}
                    >
                      {charge.shopifyOrderName}
                    </s-link>
                  </s-table-cell>
                  <s-table-cell>
                    {charge.amount} {charge.currency}
                  </s-table-cell>
                  <s-table-cell>
                    <s-badge tone={STATUS_TONE[charge.status] ?? 'auto'}>
                      {STATUS_LABEL[charge.status] ?? charge.status}
                    </s-badge>
                  </s-table-cell>
                  <s-table-cell>{new Date(charge.createdAt).toLocaleString('es')}</s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}

        {!loading && total > 0 && (
          <s-stack direction="inline" gap="base" alignItems="center">
            <s-button disabled={page <= 1 || undefined} onClick={() => setPage((p) => p - 1)}>
              Anterior
            </s-button>
            <s-text color="subdued">
              Página {page} de {totalPages} — {total} pedido{total === 1 ? '' : 's'}
            </s-text>
            <s-button disabled={page >= totalPages || undefined} onClick={() => setPage((p) => p + 1)}>
              Siguiente
            </s-button>
          </s-stack>
        )}
      </s-section>
    </s-page>
  );
}
