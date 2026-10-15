import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, ArrowUpRight, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import Header from '../components/Header.jsx';
import Skeleton from '../components/Skeleton.jsx';
import { getPastes } from '../lib/api.js';

function useDebouncedValue(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => { const timer = window.setTimeout(() => setDebounced(value), delay); return () => window.clearTimeout(timer); }, [value, delay]);
  return debounced;
}

export default function ExplorePage() {
  const [input, setInput] = useState('');
  const [page, setPage] = useState(1);
  const queryText = useDebouncedValue(input.trim());
  useEffect(() => setPage(1), [queryText]);
  const query = useQuery({ queryKey: ['pastes', page, queryText], queryFn: () => getPastes({ page, query: queryText }), placeholderData: (previous) => previous });
  return <div className="app-shell"><Header /><main className="page explore-page"><Link className="back-link" to="/"><ArrowLeft size={15} /> Back to editor</Link>
    <div className="eyebrow">A small collection</div><section className="explore-heading"><div><h1>Out in the <em>open.</em></h1><p>Notes shared for anyone to find. Private pastes stay private.</p></div><span className="collection-count">EXPLORE</span></section>
    <label className="search-box"><Search size={17} /><input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Find a note…" aria-label="Search public pastes" /><kbd>/</kbd></label>
    <section className="paste-list" aria-live="polite">{query.isLoading ? Array.from({ length: 4 }, (_, i) => <div className="paste-row" key={i}><Skeleton className="skeleton-row" /></div>) : query.isError ? <p className="empty-copy">Couldn’t load notes. Please try again.</p> : query.data.items.length === 0 ? <div className="empty-copy"><span>No notes here just yet.</span><Link to="/">Share the first one <ArrowUpRight size={14} /></Link></div> : query.data.items.map((item) => <Link className="paste-row" to={`/p/${item.id}`} key={item.id}><div className="row-icon"><span /></div><div className="row-copy"><strong>{item.title || 'Untitled note'}</strong><p>{item.preview}{item.preview.length >= 240 ? '…' : ''}</p></div><time>{new Date(item.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</time><ArrowUpRight className="row-arrow" size={16} /></Link>)}</section>
    <div className="pagination"><span>Page {page}</span><div><button disabled={page === 1 || query.isFetching} onClick={() => setPage((current) => current - 1)} aria-label="Previous page"><ArrowLeft size={15} /></button><button disabled={!query.data?.hasMore || query.isFetching} onClick={() => setPage((current) => current + 1)} aria-label="Next page"><ArrowRight size={15} /></button></div></div>
  </main><footer className="footer"><span>pastebox © 2026</span><span>Small notes. Easy sharing.</span></footer></div>;
}
