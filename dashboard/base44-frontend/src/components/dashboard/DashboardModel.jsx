import { ArrowUpRight, Boxes, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';
import IFCModelFrame from '@/components/bim/IFCModelFrame';

export default function DashboardModel({ document }) {
  return <section className="glass-card twin-stage" aria-label="D21 im dreidimensionalen Campusmodell">
    <div className="twin-stage-heading">
      <div><span className="twin-eyebrow"><MapPin className="h-3 w-3" /> Campus Darmstadt</span><h3>D21 <span>Gebäudemodell</span></h3></div>
      <span className="glass-pill twin-model-tag"><Boxes className="h-3.5 w-3.5" />D21-Campus</span>
    </div>
    <IFCModelFrame document={document} presentation="dashboard" />
    <div className="twin-stage-footer">
      <p>Drehen, zoomen und das Gebäude erkunden.</p>
      <Link to="/bim-viewer" className="glass-pill twin-open-link">Modell öffnen<ArrowUpRight className="h-3.5 w-3.5" /></Link>
    </div>
  </section>;
}
