// The runtime only auto-attaches an ID token to fetch() calls against the
// app's officially registered application_url. In local dev our tunnel URL
// changes on every restart and isn't pushed to Shopify, so we fetch the
// token ourselves and attach it explicitly instead of relying on that.
export async function authorizedFetch(path, options = {}) {
  const token = await shopify.auth.idToken();
  return fetch(path, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function authorizedJson(path, options = {}) {
  const response = await authorizedFetch(path, options);
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error || `Request failed with ${response.status}`);
  }
  return data;
}

/** @param {unknown} error */
export function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
