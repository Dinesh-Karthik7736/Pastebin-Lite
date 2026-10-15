export async function request(path, options) {
  const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...options?.headers } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

export function createPaste(input) {
  return request('/api/pastes', { method: 'POST', body: JSON.stringify(input) });
}

export function getPaste(id) { return request(`/api/pastes/${encodeURIComponent(id)}`); }

export function getPastes({ page, query }) {
  const params = new URLSearchParams({ page: String(page), limit: '8' });
  if (query) params.set('q', query);
  return request(`/api/pastes?${params}`);
}
