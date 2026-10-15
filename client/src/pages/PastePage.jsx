import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CalendarClock, Copy, Eye, FileText, LockKeyhole } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { useState } from 'react';
import Header from '../components/Header.jsx';
import Skeleton from '../components/Skeleton.jsx';
import { getPaste } from '../lib/api.js';

export default function PastePage() {
  const { id } = useParams();
  const query = useQuery({ queryKey: ['paste', id], queryFn: () => getPaste(id), staleTime: 0, gcTime: 0, retry: false });
  const [copied, setCopied] = useState(false);
  async function copy() { await navigator.clipboard.writeText(query.data.content); setCopied(true); setTimeout(() => setCopied(false), 1500); }
  return <div className="app-shell"><Header /><main className="page paste-page"><Link className="back-link" to="/"><ArrowLeft size={15} /> Back to editor</Link>
    {query.isLoading ? <section className="paste-card"><Skeleton className="skeleton-title" /><Skeleton className="skeleton-block" /></section> : query.isError ? <section className="empty-state"><div className="empty-icon"><LockKeyhole /></div><h1>This paste has<br /><em>disappeared.</em></h1><p>It may have expired, reached its view limit, or never existed.</p><Link className="submit-button link-button" to="/">Create a new paste <ArrowLeft className="flip" size={16} /></Link></section> : <section className="paste-card">
      <div className="paste-card-head"><div><div className="eyebrow"><FileText size={13} /> Shared paste</div><h1>{query.data.title || 'Untitled note'}</h1></div><button className="icon-button" onClick={copy} aria-label="Copy paste text"><Copy size={16} />{copied ? 'Copied' : 'Copy text'}</button></div>
      <div className="paste-meta"><span><CalendarClock size={14} /> Added {new Date(query.data.createdAt).toLocaleDateString()}</span><span><Eye size={14} /> View {query.data.viewCount}{query.data.maxViews ? ` of ${query.data.maxViews}` : ''}</span></div>
      <pre className="paste-content">{query.data.content}</pre>
    </section>}
  </main><footer className="footer"><span>pastebox © 2026</span><span>Small notes. Easy sharing.</span></footer></div>;
}
