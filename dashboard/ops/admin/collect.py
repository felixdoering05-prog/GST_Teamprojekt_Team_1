#!/usr/bin/env python3
"""Read host metrics locally; publish a deliberately small, secret-free JSON snapshot."""
import json, os, pathlib, pwd, re, subprocess, tempfile, time
STATUS=pathlib.Path('/var/lib/d21-admin')
def run(args):
 return subprocess.run(args,capture_output=True,text=True,timeout=12,check=True).stdout

def cpu_sample(text):
 values=list(map(int,text.splitlines()[0].split()[1:]));total=sum(values[:8]);idle=values[3]+(values[4] if len(values)>4 else 0)
 return total,idle

def key_records(text):
 records=[]
 for line in text.splitlines()[:100]:
  m=re.match(r'^\d+\s+(SHA256:[A-Za-z0-9+/=]+)\s+(.*?)\s+\(([^)]+)\)$',line)
  if m:records.append({'fingerprint':m[1],'label':m[2][:120],'type':m[3]})
 return records

def collect():
 STATUS.mkdir(mode=0o750,parents=True,exist_ok=True)
 collected=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())
 current=cpu_sample(pathlib.Path('/proc/stat').read_text());cpu=None
 try:
  previous=json.loads((STATUS/'cpu-sample.json').read_text());delta=current[0]-previous[0]
  if delta>0:cpu=round(max(0,min(100,100*(1-(current[1]-previous[1])/delta))),1)
 except (OSError,ValueError,TypeError):pass
 (STATUS/'cpu-sample.json').write_text(json.dumps(current));os.chmod(STATUS/'cpu-sample.json',0o600)
 mem={m[0]:int(m[1])*1024 for m in re.findall(r'^(\w+):\s+(\d+) kB',pathlib.Path('/proc/meminfo').read_text(),re.M)}
 disk=os.statvfs('/');memory_total=mem['MemTotal'];available=mem.get('MemAvailable',mem.get('MemFree',0))
 containers=[];container_error=None
 try:
  states={}
  for line in run(['docker','ps','-a','--format','{{json .}}']).splitlines():
   row=json.loads(line)
   if row['Names'].startswith(('d21_','d21-')):states[row['Names']]={'name':row['Names'],'state':row.get('State','unknown'),'status':row.get('Status','')[:120]}
  stats={}
  for line in run(['docker','stats','--no-stream','--format','{{json .}}']).splitlines():
   row=json.loads(line);stats[row['Name']]={'cpu':row.get('CPUPerc'),'memory':row.get('MemUsage')}
  containers=[{**row,**stats.get(name,{})} for name,row in sorted(states.items())]
 except (subprocess.SubprocessError,ValueError,KeyError):container_error='Containerdaten konnten nicht gelesen werden.'
 access=[]
 for user in pwd.getpwall():
  if user.pw_uid!=0 and not 1000<=user.pw_uid<60000:continue
  paths=[pathlib.Path('/etc/ssh/authorized_keys')/user.pw_name,pathlib.Path(user.pw_dir)/'.ssh/authorized_keys']
  keys=[]
  for path in paths:
   if path.is_file():
    try:keys+=key_records(run(['ssh-keygen','-lf',str(path)]))
    except subprocess.SubprocessError:pass
  if not keys:continue
  kind='SSH';root=user.pw_uid==0
  try:
   settings=run(['sshd','-T','-C',f'user={user.pw_name},host=localhost,addr=127.0.0.1'])
   if 'forcecommand internal-sftp' in settings:kind='SFTP, eingeschränkter Dateiordner'
  except subprocess.SubprocessError:kind='SSH-Konfiguration nicht geprüft'
  access.append({'user':user.pw_name,'root':root,'access':kind,'keys':keys})
 return {'version':1,'collected_at':collected,'cpu_percent':cpu,'cpu_cores':os.cpu_count(),'load':list(os.getloadavg()),'uptime_seconds':float(pathlib.Path('/proc/uptime').read_text().split()[0]),'memory':{'total':memory_total,'used':memory_total-available,'available':available},'disk':{'total':disk.f_blocks*disk.f_frsize,'used':(disk.f_blocks-disk.f_bfree)*disk.f_frsize,'available':disk.f_bavail*disk.f_frsize},'containers':containers,'container_error':container_error,'ssh_access':access}

def main():
 data=collect()
 with tempfile.NamedTemporaryFile(mode='w',dir=STATUS,delete=False) as stream:
  temporary=pathlib.Path(stream.name);os.chmod(temporary,0o640);json.dump(data,stream,ensure_ascii=False)
 os.replace(temporary,STATUS/'status.json')
if __name__=='__main__':main()
