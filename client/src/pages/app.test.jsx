// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CreatePage from './CreatePage.jsx';
import ExplorePage from './ExplorePage.jsx';
import PastePage from './PastePage.jsx';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function jsonResponse(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload };
}

function renderPage(element, initialEntry = '/') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>{element}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe('Pastebox user flows', () => {
  it('creates a paste and presents the share link', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 'aBc123', url: 'http://localhost/p/aBc123' }, 201));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderPage(<CreatePage />);

    await user.type(screen.getByLabelText(/Your text/), 'Keep this note');
    await user.click(screen.getByRole('button', { name: /create share link/i }));

    expect(await screen.findByText('Your paste is ready')).toBeTruthy();
    expect(screen.getByText('http://localhost/p/aBc123')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith('/api/pastes', expect.objectContaining({ method: 'POST' }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ content: 'Keep this note', expiresIn: 'never', maxViews: 'unlimited', discoverable: false });
  });

  it('loads and displays a shared paste', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      id: 'paste-1', title: 'A saved thought', content: 'A line of text.', createdAt: '2026-10-15T10:00:00Z',
      expiresAt: null, maxViews: null, viewCount: 1
    }));
    vi.stubGlobal('fetch', fetchMock);
    renderPage(<Routes><Route path="/p/:id" element={<PastePage />} /></Routes>, '/p/paste-1');

    expect(await screen.findByText('A saved thought')).toBeTruthy();
    expect(screen.getByText('A line of text.')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith('/api/pastes/paste-1', expect.anything());
  });

  it('debounces Explore search and fetches the matching page', async () => {
    const fetchMock = vi.fn().mockImplementation((url) => {
      const items = String(url).includes('q=road')
        ? [{ id: 'roadmap-1', title: 'Roadmap notes', preview: 'A few plans.', created_at: '2026-10-15T10:00:00Z' }]
        : [];
      return Promise.resolve(jsonResponse({ items, page: 1, limit: 8, hasMore: false }));
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderPage(<ExplorePage />);
    await screen.findByText('No notes here just yet.');
    await user.type(screen.getByRole('textbox', { name: 'Search public pastes' }), 'road');

    expect(await screen.findByText('Roadmap notes')).toBeTruthy();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('q=road'), expect.anything()));
  });
});
