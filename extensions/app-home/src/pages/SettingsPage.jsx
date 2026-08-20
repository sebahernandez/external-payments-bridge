import {useState, useEffect} from 'preact/hooks';
import {authorizedFetch} from '../lib/api.js';

const PROVIDERS = [{value: 'manual-confirm', label: 'Confirmación manual (modo de prueba)'}];

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [providerId, setProviderId] = useState(PROVIDERS[0].value);
  const [credentialsJson, setCredentialsJson] = useState('{}');
  const [status, setStatus] = useState(/** @type {'idle'|'saved'|'error'} */ ('idle'));
  const [loadError, setLoadError] = useState(/** @type {string|null} */ (null));

  useEffect(() => {
    (async () => {
      try {
        const response = await authorizedFetch('/api/merchant-config');
        if (response.ok) {
          const data = await response.json();
          if (data.providerId) setProviderId(data.providerId);
        } else {
          setLoadError(`El backend respondió ${response.status}`);
        }
      } catch (error) {
        setLoadError(String(error));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function onSave() {
    setSaving(true);
    setStatus('idle');
    try {
      const credentials = JSON.parse(credentialsJson || '{}');
      const response = await authorizedFetch('/api/merchant-config', {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({providerId, credentials}),
      });
      setStatus(response.ok ? 'saved' : 'error');
    } catch {
      setStatus('error');
    } finally {
      setSaving(false);
    }
  }

  /** @param {Event} event */
  function onProviderChange(event) {
    setProviderId(/** @type {HTMLSelectElement} */ (event.currentTarget).value);
  }

  /** @param {Event} event */
  function onCredentialsChange(event) {
    setCredentialsJson(/** @type {HTMLTextAreaElement} */ (event.currentTarget).value);
  }

  if (loading) {
    return (
      <s-page heading="Configuración de pagos">
        <s-section>
          <s-paragraph>Cargando…</s-paragraph>
        </s-section>
      </s-page>
    );
  }

  return (
    <s-page heading="Configuración de pagos">
      <s-section heading="Proveedor de pago externo">
        <s-paragraph>
          Elegí qué riel de pago procesa los cobros de los pedidos hechos con tu método de pago
          manual, y cómo se autentica con ese proveedor.
        </s-paragraph>

        {loadError && <s-banner tone="critical">No se pudo cargar la configuración: {loadError}</s-banner>}

        <s-select
          label="Proveedor"
          value={providerId}
          onChange={onProviderChange}
        >
          {PROVIDERS.map((provider) => (
            <s-option key={provider.value} value={provider.value}>
              {provider.label}
            </s-option>
          ))}
        </s-select>

        <s-text-area
          label="Credenciales (JSON)"
          value={credentialsJson}
          onChange={onCredentialsChange}
          rows={4}
        />

        {status === 'saved' && <s-banner tone="success">Configuración guardada.</s-banner>}
        {status === 'error' && <s-banner tone="critical">No se pudo guardar. Intentá de nuevo.</s-banner>}

        <s-button variant="primary" onClick={onSave} loading={saving || undefined}>
          Guardar
        </s-button>
      </s-section>
    </s-page>
  );
}
