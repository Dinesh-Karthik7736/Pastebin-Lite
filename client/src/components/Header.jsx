import { ArrowUpRight, Command } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Header() {
  return <header className="topbar"><Link className="brand" to="/"><span className="brand-mark"><Command size={17} /></span><span>pastebox</span></Link><nav><Link to="/explore">Explore pastes <ArrowUpRight size={14} /></Link><span className="status"><i /> Ready when you are</span></nav></header>;
}
