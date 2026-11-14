import hashlib,json,os,subprocess,sys,tempfile,time
import psycopg
from psycopg.types.json import Jsonb
# One serial worker; automatic discovery includes existing uploads, scans and accepted plan outputs.
# Failed jobs remain visible and are not retried endlessly.
CURRENT_VERSION=3
def run_analysis(content):
    state='failed';report={'error':'IFC-Analyse fehlgeschlagen oder Zeitlimit erreicht.'}
    try:
        with tempfile.TemporaryDirectory(prefix='ifc-') as folder:
            path=folder+'/model.ifc'
            with open(path,'wb') as out:out.write(bytes(content))
            # File descriptors avoid unbounded captured subprocess output.
            with open(folder+'/report.json','w+b') as output:
                completed=subprocess.run([sys.executable,'/worker/analyze.py',path],stdout=output,stderr=subprocess.DEVNULL,timeout=120,check=False)
                if completed.returncode==0 and output.tell()<=512*1024:
                    output.seek(0);report=json.load(output);report['source_sha256']=hashlib.sha256(bytes(content)).hexdigest();state='ready'
    except Exception:pass
    return state,report
def process(db):
    with db.transaction():
        db.execute("UPDATE app_ifc_analysis SET status='failed',report=%s,updated_at=now() WHERE status='running' AND updated_at<now()-interval '5 minutes'",(Jsonb({'error':'Analyse unterbrochen.'}),))
        row=db.execute("SELECT d.id FROM app_documents d LEFT JOIN app_ifc_analysis a ON a.document_id=d.id WHERE d.mime_type='application/x-step' AND a.document_id IS NULL ORDER BY d.id LIMIT 1").fetchone()
        if not row:return False
        document=row[0]
        db.execute("INSERT INTO app_ifc_analysis(document_id,status) VALUES(%s,'running')",(document,))
    content=db.execute('SELECT content FROM app_documents WHERE id=%s',(document,)).fetchone()
    if not content:return True
    state,report=run_analysis(content[0])
    db.execute("UPDATE app_ifc_analysis SET status=%s,report=%s,updated_at=now() WHERE document_id=%s AND status='running'",(state,Jsonb(report),document))
    return True
def reanalyze(db):
    # Background upgrade of older ready reports (e.g. room areas). Non-destructive: the old report stays
    # visible until the new one is ready; a failed attempt is only marked and never retried for this version.
    row=db.execute("""SELECT document_id FROM app_ifc_analysis WHERE status='ready'
        AND COALESCE((report->>'version')::int,1)<%s AND COALESCE((report->>'reanalysis_failed_version')::int,0)<%s
        ORDER BY document_id DESC LIMIT 1""",(CURRENT_VERSION,CURRENT_VERSION)).fetchone()
    if not row:return False
    document=row[0]
    content=db.execute('SELECT content FROM app_documents WHERE id=%s',(document,)).fetchone()
    if not content:return True
    state,report=run_analysis(content[0])
    if state=='ready':db.execute("UPDATE app_ifc_analysis SET report=%s,updated_at=now() WHERE document_id=%s AND status='ready'",(Jsonb(report),document))
    else:db.execute("UPDATE app_ifc_analysis SET report=report||%s WHERE document_id=%s AND status='ready'",(Jsonb({'reanalysis_failed_version':CURRENT_VERSION}),document))
    return True
SCAN_FAILURES={'scan_invalid':'Der Scan konnte nicht in ein IFC-Modell umgewandelt werden. Bitte erneut scannen.','output_too_large':'Das erzeugte Modell ist zu groß.','worker_interrupted':'Verarbeitung unterbrochen. Bitte erneut senden.'}
def process_scan(db):
    # LiDAR room scans from the iPhone: JSON in, IFC4 out. Same isolation as the analysis (subprocess, timeout, size limits).
    if not db.execute("SELECT to_regclass('app_room_scan_jobs') IS NOT NULL").fetchone()[0]:return False
    with db.transaction():
        db.execute("UPDATE app_room_scan_jobs SET status='failed',failure_code='worker_interrupted',warnings=%s,payload=NULL,lease_until=NULL,updated_at=now() WHERE status='running' AND lease_until<now()",(Jsonb([SCAN_FAILURES['worker_interrupted']]),))
        db.execute("UPDATE app_room_scan_jobs SET payload=NULL,output_ifc=NULL,status=CASE WHEN status='ready' THEN 'rejected' ELSE status END,updated_at=now() WHERE (payload IS NOT NULL OR output_ifc IS NOT NULL) AND status<>'queued' AND updated_at<now()-interval '7 days'")
        row=db.execute("UPDATE app_room_scan_jobs SET status='running',lease_until=now()+interval '4 minutes',updated_at=now() WHERE id=(SELECT id FROM app_room_scan_jobs WHERE status='queued' ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING id,user_id,building_id,payload").fetchone()
    if not row:return False
    job,user,building,payload=row
    code='scan_invalid';summary=None;ifc=None
    try:
        with tempfile.TemporaryDirectory(prefix='scan-') as folder:
            with open(folder+'/scan.json','w',encoding='utf-8') as source:json.dump(payload,source)
            with open(folder+'/summary.json','w+b') as output:
                completed=subprocess.run([sys.executable,'/worker/roomscan.py',folder+'/scan.json',folder+'/model.ifc'],stdout=output,stderr=subprocess.DEVNULL,timeout=150,check=False)
                if completed.returncode==0 and output.tell()<=256*1024:
                    output.seek(0);summary=json.load(output)
                    if os.path.getsize(folder+'/model.ifc')>20*1024*1024:code='output_too_large'
                    else:
                        with open(folder+'/model.ifc','rb') as model:ifc=model.read()
    except Exception:pass
    if ifc and summary and ifc.startswith(b'ISO-10303-21'):
        with db.transaction():
            done=db.execute("UPDATE app_room_scan_jobs SET status='ready',payload=NULL,output_ifc=%s,summary=%s,warnings=%s,lease_until=NULL,updated_at=now() WHERE id=%s AND status='running' RETURNING id",(ifc,Jsonb(summary),Jsonb(summary.get('warnings',[])),job)).fetchone()
            if done:db.execute("INSERT INTO app_notifications(user_id,kind,title,building_id) VALUES(%s,'scan_ready',%s,%s)",(user,'Dein Raumscan wurde auf dem Server zu einem IFC-Modell. Bitte prüfen und übernehmen.',building))
    else:
        db.execute("UPDATE app_room_scan_jobs SET status='failed',failure_code=%s,warnings=%s,payload=NULL,lease_until=NULL,updated_at=now() WHERE id=%s AND status='running'",(code,Jsonb([SCAN_FAILURES[code]]),job))
    return True
while True:
    try:
        with psycopg.connect(os.environ['DATABASE_URL'],autocommit=True) as db:
            # Session lock makes discovery safe if more than one container is accidentally started.
            if not db.execute('SELECT pg_try_advisory_lock(610213)').fetchone()[0]:time.sleep(5);continue
            while True:
                worked=process_scan(db)
                # New uploads and scans first; older reports are upgraded only when nothing else waits.
                if not process(db) and not worked and not reanalyze(db):time.sleep(2)
    except Exception:
        print('ifc-worker: waiting for database/schema',flush=True);time.sleep(5)
