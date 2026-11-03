const actions = ['hide', 'color', 'reset'];
const targets = ['selected', 'walls', 'doors', 'windows', 'roofs', 'slabs', 'all'];
export function validateCommand(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== 'action,color,summary,target') throw Error('Ungültiger Modellbefehl.');
  const { action, target, color, summary } = value;
  if (!actions.includes(action) || !targets.includes(target) || typeof summary !== 'string' || summary.length > 300 || !summary.trim()) throw Error('Dieser Befehl wird noch nicht unterstützt.');
  if ((action === 'reset' && target !== 'all') || (action === 'color' ? typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color) : color !== null)) throw Error('Ungültige Aktion oder Farbe.');
  return { action, target, color, summary };
}
function describe(command) {
  const labels = { selected:'Ausgewähltes Bauteil', walls:'Alle Wände', doors:'Alle Türen', windows:'Alle Fenster', roofs:'Alle IFC-Dächer', slabs:'Alle IFC-Decken/Platten', all:'Alle Bauteile' };
  if (command.action === 'reset') return 'Alle Bauteile anzeigen und Originalfarben wiederherstellen';
  return command.action === 'hide' ? `${labels[command.target]} ausblenden` : `${labels[command.target]} mit ${command.color.toUpperCase()} einfärben`;
}
export function prepareCommand(value, appearance, types) {
  const command = validateCommand(value);
  const ids = command.target === 'selected' ? [appearance.selectedID].filter(id => appearance.elements.has(id)) : [...appearance.elements.keys()].filter(id => command.target === 'all' || types.get(id) === command.target);
  if (!ids.length) throw Error(command.target === 'selected' ? 'Bitte zuerst ein Bauteil im Modell antippen.' : 'Keine passenden darstellbaren Bauteile in diesem IFC gefunden.');
  return { command, ids, description: describe(command) };
}
export function applyCommand(plan, appearance) {
  const command = validateCommand(plan.command);
  if (!Array.isArray(plan.ids) || !plan.ids.length || plan.ids.length > 10000 || new Set(plan.ids).size !== plan.ids.length || plan.ids.some(id => !Number.isInteger(id) || !appearance.elements.has(id))) throw Error('Der Modellstand passt nicht mehr. Bitte den Befehl erneut prüfen.');
  // Every mesh of a logical IFC element is changed; no eval, scripts, file writes or network calls.
  appearance.select(undefined);
  for (const id of plan.ids) for (const mesh of appearance.elements.get(id)) {
    if (command.action === 'hide') mesh.visible = false;
    if (command.action === 'color') mesh.material.color.set(command.color);
    if (command.action === 'reset') { mesh.visible = true; mesh.material.color.copy(mesh.userData.originalColor); }
  }
  return plan.ids.length;
}
export function localCommand(text) {
  const value = text.trim().toLowerCase().replace(/[.!]$/,'');
  const presets = {
    'blende alle wände aus': { action: 'hide', target: 'walls', color: null, summary: 'Alle Wände ausblenden' },
    'färbe alle wände blau': { action: 'color', target: 'walls', color: '#2563eb', summary: 'Alle Wände blau einfärben' },
    'alles zurücksetzen': { action: 'reset', target: 'all', color: null, summary: 'Alle Bauteile anzeigen und Originalfarben wiederherstellen' },
    'ausgewähltes bauteil ausblenden': { action: 'hide', target: 'selected', color: null, summary: 'Ausgewähltes Bauteil ausblenden' },
  };
  if (!Object.hasOwn(presets, value)) throw Error('Lokal sind die vier Beispielbefehle verfügbar. Freie Formulierungen mit dem konfigurierten KI-Dienst gibt es bei gespeicherten Modellen in der iPhone-App.');
  return presets[value];
}
function commandRequestID() {
  const bytes = crypto.getRandomValues(new Uint8Array(16)); bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const h = [...bytes].map(n => n.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
export function mountCommands({ appearance, types, update, changed = () => {}, destroyed }) {
  const panel = document.querySelector('#commands');
  const input = document.querySelector('#command-input');
  const output = document.querySelector('#command-result');
  const execute = document.querySelector('#command-execute');
  const preview = document.querySelector('#command-preview');
  const consent = document.querySelector('#command-consent');
  const remote = window.webkit?.messageHandlers.ifcCommandRequest;
  let plan, ticket, busy = false, currentProvider, providerTicket;
  const providerBridge=window.webkit?.messageHandlers.ifcProviderRequest;
  function clear() { plan = undefined; execute.disabled = true; output.textContent = ''; }
  function cancel() { ticket = undefined; busy = false; preview.disabled = !!remote && !currentProvider; clear(); }
  document.querySelector('#command-open').onclick = () => { panel.hidden = false; if(remote) loadProvider(); };
  document.querySelector('#command-close').onclick = () => { cancel(); panel.hidden = true; };
  const note=document.querySelector('#command-mode-note');
  note.textContent=remote?'KI-Anbieter wird geprüft …':'Vier feste Beispielbefehle, vollständig lokal. Keine externe KI-Anfrage. Bei gespeicherten Modellen werden bestätigte Änderungen gemeinsam auf dem Server gespeichert.';
  function loadProvider(){
    cancel();currentProvider=undefined;consent.checked=false;preview.disabled=true;
    if(!providerBridge){note.textContent='Bitte die App aktualisieren, um den KI-Anbieter zu prüfen.';return;}
    note.textContent='KI-Anbieter wird geprüft …';providerTicket=commandRequestID();providerBridge.postMessage({id:providerTicket});
  }
  window.d21ProviderReply=(id,provider,name,error)=>{
    if(destroyed()||id!==providerTicket)return;
    providerTicket=undefined;
    if(error||!['gemini','hda'].includes(provider)){note.textContent=String(error||'Unbekannter KI-Dienst.');return;}
    currentProvider=provider;consent.checked=false;
    note.textContent=`${name} übersetzt nur deinen Befehlstext. Keine IFC-Datei, Bauteildaten oder Gebäudemetadaten werden übertragen. Bestätigte Änderungen werden bei gespeicherten Modellen gemeinsam auf dem Server gespeichert.`;
    document.querySelector('#command-consent-text').textContent=`Nur diesen Befehlstext an ${name} senden`;
    preview.disabled=false;
  };
  document.querySelector('#command-consent-label').hidden = !remote;
  document.querySelectorAll('[data-command]').forEach(button => button.onclick = () => { cancel(); input.value = button.dataset.command; });
  input.oninput = cancel;
  consent.onchange = () => { if (!consent.checked) cancel(); };
  function proposal(command) {
    plan = prepareCommand(command, appearance, types);
    output.textContent = `${plan.description}\nBetroffen: ${plan.ids.length} Bauteil(e). Noch nicht ausgeführt.`;
    execute.disabled = false;
  }
  window.d21CommandReply = (id, command, error) => {
    if (destroyed() || id !== ticket) return;
    ticket = undefined; busy = false; preview.disabled = false;
    try { if (error) throw Error(String(error)); if (command?.action === 'unsupported') throw Error(command.summary || 'Dieser Befehl wird noch nicht unterstützt.'); proposal(command); }
    catch (e) { clear(); output.textContent = e.message; }
  };
  preview.onclick = () => {
    if (destroyed() || busy) return;
    clear();
    try {
      if (!input.value.trim() || input.value.length > 500) throw Error('Bitte einen Befehl mit maximal 500 Zeichen eingeben.');
      if (remote) {
        if(!currentProvider) throw Error('Bitte den KI-Anbieter durch erneutes Öffnen prüfen.');
        if (!consent.checked) throw Error('Bitte die Übertragung des Befehlstexts bestätigen.');
        ticket = commandRequestID(); busy = true; preview.disabled = true; output.textContent = 'Befehl wird übersetzt …';
        remote.postMessage({ id: ticket, question: input.value, provider:currentProvider });
      } else proposal(localCommand(input.value));
    } catch (e) { output.textContent = e.message; }
  };
  execute.onclick = () => {
    if (!plan || destroyed()) return;
    try { const operation={action:plan.command.action,ids:plan.ids,color:plan.command.color}; const count = applyCommand(plan, appearance); changed(operation); clear(); update(); output.textContent = `${count} Bauteil(e) geändert. Bei Servermodellen läuft die Speicherung. Die IFC-Datei bleibt unverändert.`; }
    catch (e) { clear(); output.textContent = e.message; }
  };
  window.addEventListener('pagehide', () => { cancel(); delete window.d21CommandReply; delete window.d21ProviderReply; }, { once: true });
  return cancel;
}
