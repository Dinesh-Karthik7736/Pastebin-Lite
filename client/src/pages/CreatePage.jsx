import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ArrowDown, ArrowRight, Check, Clock3, Copy, Eye, LockKeyhole, Plus, Sparkles } from 'lucide-react';
import Header from '../components/Header.jsx';
import { createPaste } from '../lib/api.js';

export default function CreatePage() {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [expiresIn, setExpiresIn] = useState('never');
  const [maxViews, setMaxViews] = useState('unlimited');
  const [discoverable, setDiscoverable] = useState(false);
  const [copied, setCopied] = useState(false);
  const mutation = useMutation({ mutationFn: createPaste });

  async function copyLink() {
    await navigator.clipboard.writeText(mutation.data.url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  function reset() { mutation.reset(); setTitle(''); setContent(''); setExpiresIn('never'); setMaxViews('unlimited'); }

  return <div className="app-shell"><Header /><main className="page">
    <div className="eyebrow"><Sparkles size={13} /> A little space for your words</div>
    <section className="hero"><h1>Keep a note.<br /><em>Pass it on.</em></h1><p>A quiet, simple place to save text and share it with a link.</p></section>
    <section className="editor-card">
      {mutation.isSuccess ? <div className="success-panel">
        <div className="success-icon"><Check size={20} /></div><div className="eyebrow">Your paste is ready</div><h2>Good things are<br />meant to be shared.</h2><p>Anyone with this link can open your note.</p>
        <div className="share-link"><span>{mutation.data.url}</span><button onClick={copyLink} aria-label="Copy share link">{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? 'Copied' : 'Copy'}</button></div>
        <button className="text-button" onClick={reset}><Plus size={15} /> Create another</button>
      </div> : <form onSubmit={(event) => { event.preventDefault(); mutation.mutate({ title, content, expiresIn, maxViews, discoverable }); }}>
        <div className="editor-heading"><div><span className="step">01</span><div><h2>A new paste</h2><p>Write or drop in your text below.</p></div></div><span className="privacy-label"><LockKeyhole size={12} /> Private by default</span></div>
        <label className="field-label" htmlFor="title">Title <span>Optional</span></label>
        <input id="title" className="title-input" maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Give it a name..." />
        <label className="field-label content-label" htmlFor="content">Your text <span>{content.length.toLocaleString()} / 500,000</span></label>
        <textarea id="content" required maxLength={500000} value={content} onChange={(event) => setContent(event.target.value)} placeholder="Start typing something worth keeping..." />
        <div className="editor-footer"><span><span className="live-dot" />Autosaved as you type</span><span>Plain text · up to 500 KB</span></div>
        <div className="options-grid">
          <label className="option"><Clock3 size={16} /><span>Expire after</span><select value={expiresIn} onChange={(event) => setExpiresIn(event.target.value)}><option value="never">Never</option><option value="1h">1 hour</option><option value="1d">1 day</option><option value="7d">7 days</option><option value="30d">30 days</option></select></label>
          <label className="option"><Eye size={16} /><span>View limit</span><select value={maxViews} onChange={(event) => setMaxViews(event.target.value)}><option value="unlimited">Unlimited</option><option value="1">1 view</option><option value="5">5 views</option><option value="10">10 views</option><option value="25">25 views</option></select></label>
        </div>
        <label className="discoverable"><input type="checkbox" checked={discoverable} onChange={(event) => setDiscoverable(event.target.checked)} /><span>Include in Explore<small>Let others find this paste. Off by default.</small></span></label>
        {mutation.isError && <p className="error-message" role="alert">{mutation.error.message}</p>}
        <button className="submit-button" type="submit" disabled={!content.trim() || mutation.isPending}>{mutation.isPending ? 'Saving your paste…' : <>Create share link <ArrowRight size={17} /></>}</button>
        <div className="form-note"><LockKeyhole size={12} /> Your paste is only visible to people with its link.</div>
      </form>}
    </section>
    <div className="below-note"><span>Simple by design</span><ArrowDown size={14} /><span>Here when you need it</span></div>
  </main><footer className="footer"><span>pastebox © 2026</span><span>Small notes. Easy sharing.</span></footer></div>;
}
