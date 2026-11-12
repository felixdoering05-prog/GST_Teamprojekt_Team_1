import { useEffect, useState } from 'react';
import { ArrowUpRight, Boxes, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';
import { request } from '@/api/base44Client';
import IFCModelFrame from '@/components/bim/IFCModelFrame';

export default function DashboardModel() {
  const [model, setModel] = useState({ loading: true, available: false, message: '' });
  useEffect(() => {
    let active = true;
    request('/campus/d21').then(() => {
      if (active) setModel({ loading: false, available: true, message: '' });
    }).catch(error => {
      if (active) setModel({ loading: false, available: false, message: error.message });
    });
    return () => { active = false; };
  }, []);
  return <section className="glass-card twin-stage" aria-label="D21 im dreidimensionalen Campusmodell">
    <div className="twin-stage-heading">
      <div><span className="twin-eyebrow"><MapPin className="h-3 w-3" /> Campus Darmstadt</span><h3>D21 <span>Digital Twin</span></h3></div>
      <span className="glass-pill twin-model-tag"><Boxes className="h-3.5 w-3.5" />{model.available ? 'D21-Campus' : 'Campuskarte'}</span>
    </div>
    {model.loading ? <div className="twin-stage-loading" role="status"><span className="h-6 w-6 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />D21 wird vorbereitet …</div> : <IFCModelFrame document={{ id: 'campus-d21', name: 'H_DA_D21_Final.ifc', campus: true, mapOnly: !model.available }} presentation="dashboard" />}
    <div className="twin-stage-footer">
      <p>{model.message ? 'Das private Modell ist derzeit nicht verfügbar. Die Campuskarte bleibt nutzbar.' : 'Drehen, zoomen und das Gebäude erkunden.'}</p>
      <Link to="/bim-viewer" className="glass-pill twin-open-link">Modell öffnen<ArrowUpRight className="h-3.5 w-3.5" /></Link>
    </div>
  </section>;
}
