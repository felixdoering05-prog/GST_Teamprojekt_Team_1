"""Run interactively on Felix's Mac. Never paste Wi-Fi credentials into a chat."""
import argparse,getpass,json,os,shutil,socket,ssl,subprocess,tempfile
from pathlib import Path
from urllib.parse import urlsplit
p=argparse.ArgumentParser()
p.add_argument('--device-file',required=True,help='Private JSON with token and input_url, outside Git')
p.add_argument('--cli',default='/tmp/d21-arduino/bin/arduino-cli')
p.add_argument('--config',default='/tmp/d21-arduino/arduino-cli.yaml')
p.add_argument('--port',default='/dev/cu.usbmodem1101')
p.add_argument('--build-only',action='store_true')
a=p.parse_args()
cfg=json.loads(Path(a.device_file).read_text());u=urlsplit(cfg['input_url'])
if u.scheme!='https' or u.username or u.password or u.port not in (None,443) or not u.hostname:raise SystemExit('Gueltige HTTPS-Adresse erforderlich.')
# Root is obtained from a hostname-verified chain using the Mac/Python trust store.
with socket.create_connection((u.hostname,443),timeout=15) as raw:
 with ssl.create_default_context().wrap_socket(raw,server_hostname=u.hostname) as connection:
  chain=connection._sslobj.get_verified_chain()
  ca=chain[-1].public_bytes()
if isinstance(ca,bytes):ca=ca.decode()
if 'BEGIN CERTIFICATE' not in ca:raise SystemExit('Verifizierte Zertifikatskette konnte nicht gelesen werden.')
ssid=input('WLAN-Name (nur 2,4 GHz): ').strip()
password=getpass.getpass('WLAN-Passwort (unsichtbar): ')
if not ssid:raise SystemExit('WLAN-Name fehlt.')
with tempfile.TemporaryDirectory(prefix='d21-esp-build-') as tmp:
 root=Path(tmp);root.chmod(0o700);sketch=root/'esp32-simulation';sketch.mkdir(mode=0o700)
 shutil.copy(Path(__file__).with_name('esp32-simulation.ino'),sketch/'esp32-simulation.ino')
 header='#pragma once\n'
 for key,value in [('WIFI_SSID',ssid),('WIFI_PASSWORD',password),('DEVICE_TOKEN',cfg['token']),('INPUT_URL',cfg['input_url'])]:header+='#define '+key+' '+json.dumps(value,ensure_ascii=True)+'\n'
 header+='static const char SERVER_ROOT_CA[] PROGMEM=R"CERT('+ca+')CERT";\n'
 secret=sketch/'secrets.h';secret.write_text(header);secret.chmod(0o600)
 command=[a.cli,'--config-file',a.config]
 board='esp32:esp32:esp32s3:FlashSize=4M,PSRAM=disabled,USBMode=hwcdc,CDCOnBoot=cdc'
 # Build logs/temporary binaries may contain credentials; keep private and remove after completion.
 with open(root/'build.log','w') as log:
  result=subprocess.run(command+['compile','--fqbn',board,'--output-dir',str(root/'build'),str(sketch)],stdout=log,stderr=log)
 if result.returncode:raise SystemExit('Build fehlgeschlagen; keine Firmware aufgespielt. Einstellungen pruefen lassen.')
 print('Firmware erfolgreich gebaut.')
 if not a.build_only:
  print('Die bestehende Firmware wird jetzt durch die Simulation ersetzt. Sicherung muss vorher erstellt sein.')
  result=subprocess.run(command+['upload','--fqbn',board,'--port',a.port,'--input-dir',str(root/'build')],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
  if result.returncode:raise SystemExit('Upload fehlgeschlagen. BOOT/RESET und USB-Verbindung pruefen.')
  print('Simulation installiert. Messwerte erscheinen als Demo im zugeordneten Gebaeude.')
