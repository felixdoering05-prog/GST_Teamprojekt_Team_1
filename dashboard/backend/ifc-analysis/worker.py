import hashlib,json,os,subprocess,sys,tempfile,time
import psycopg
from psycopg.types.json import Jsonb
# One serial worker; automatic discovery includes existing uploads, scans and accepted plan outputs.
# Failed jobs remain visible and are not retried endlessly.
def process(db):
    with db.transaction():
        db.execute("UPDATE app_ifc_analysis SET status='failed',report=%s,updated_at=now() WHERE status='running' AND updated_at<now()-interval '5 minutes'",(Jsonb({'error':'Analyse unterbrochen.'}),))
        row=db.execute("SELECT d.id FROM app_documents d LEFT JOIN app_ifc_analysis a ON a.document_id=d.id WHERE d.mime_type='application/x-step' AND a.document_id IS NULL ORDER BY d.id LIMIT 1").fetchone()
        if not row:return False
        document=row[0]
        db.execute("INSERT INTO app_ifc_analysis(document_id,status) VALUES(%s,'running')",(document,))
    content=db.execute('SELECT content FROM app_documents WHERE id=%s',(document,)).fetchone()
    if not content:return True
    state='failed';report={'error':'IFC-Analyse fehlgeschlagen oder Zeitlimit erreicht.'}
    try:
        with tempfile.TemporaryDirectory(prefix='ifc-') as folder:
            path=folder+'/model.ifc'
            with open(path,'wb') as out:out.write(bytes(content[0]))
            # File descriptors avoid unbounded captured subprocess output.
            with open(folder+'/report.json','w+b') as output:
                completed=subprocess.run([sys.executable,'/worker/analyze.py',path],stdout=output,stderr=subprocess.DEVNULL,timeout=120,check=False)
                if completed.returncode==0 and output.tell()<=512*1024:
                    output.seek(0);report=json.load(output);report['source_sha256']=hashlib.sha256(bytes(content[0])).hexdigest();state='ready'
    except Exception:pass
    db.execute("UPDATE app_ifc_analysis SET status=%s,report=%s,updated_at=now() WHERE document_id=%s AND status='running'",(state,Jsonb(report),document))
    return True
while True:
    try:
        with psycopg.connect(os.environ['DATABASE_URL'],autocommit=True) as db:
            # Session lock makes discovery safe if more than one container is accidentally started.
            if not db.execute('SELECT pg_try_advisory_lock(610213)').fetchone()[0]:time.sleep(5);continue
            while True:
                if not process(db):time.sleep(5)
    except Exception:
        print('ifc-worker: waiting for database/schema',flush=True);time.sleep(5)
