// Sprachumschaltung der Web-App (Deutsch / Englisch).
//
// Die Oberfläche ist auf Deutsch geschrieben. Für Englisch übersetzt ein
// MutationObserver sichtbare Texte und einige Attribute anhand eines
// Wörterbuchs (deutscher Text → englischer Text). So bleiben alle Seiten
// unverändert und neue deutsche Texte erscheinen schlimmstenfalls auf Deutsch.
// Bereiche mit translate="no" (z. B. Chatverläufe, Eingaben) bleiben unberührt.

export const LANGUAGES = [
  { value: 'de', label: 'Deutsch' },
  { value: 'en', label: 'English' },
];

const storageKey = 'nala-language';
const ATTRIBUTES = ['placeholder', 'title', 'aria-label', 'alt'];
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE', 'NOSCRIPT']);

export function storedLanguage() {
  try { return localStorage.getItem(storageKey) === 'en' ? 'en' : 'de'; }
  catch { return 'de'; }
}

export function rememberLanguage(language) {
  try { localStorage.setItem(storageKey, language === 'en' ? 'en' : 'de'); }
  catch { /* Speicher gesperrt: das Konto hält die Einstellung trotzdem. */ }
}

let dictionary = null;
let patterns = [];
const written = new WeakMap();

// Übersetzt einen einzelnen Text. Leerzeichen am Rand bleiben erhalten.
export function translateText(text) {
  if (!dictionary || !text) return text;
  const key = text.replace(/\s+/g, ' ').trim();
  if (!key || !/[A-Za-zÄÖÜäöüß]/.test(key)) return text;
  let english = dictionary[key];
  if (english === undefined) {
    for (const [pattern, replace] of patterns) {
      const match = key.match(pattern);
      if (match) { english = replace(...match.slice(1)); break; }
    }
  }
  if (english === undefined || english === key) return text;
  const lead = text.match(/^\s*/)[0];
  const trail = text.match(/\s*$/)[0];
  return lead + english + trail;
}

function skipped(element) {
  for (let node = element; node && node.nodeType === 1; node = node.parentElement) {
    if (SKIP_TAGS.has(node.tagName) || node.getAttribute('translate') === 'no' || node.isContentEditable) return true;
  }
  return false;
}

function translateTextNode(node) {
  if (written.get(node) === node.nodeValue || skipped(node.parentElement)) return;
  const next = translateText(node.nodeValue);
  if (next !== node.nodeValue) node.nodeValue = next;
  written.set(node, node.nodeValue);
}

function translateAttributes(element) {
  if (skipped(element)) return;
  for (const name of ATTRIBUTES) {
    const value = element.getAttribute(name);
    if (!value) continue;
    const next = translateText(value);
    if (next !== value) element.setAttribute(name, next);
  }
  // Schaltflächen aus <input type="submit|button"> tragen ihren Text im value.
  if (element.tagName === 'INPUT' && ['submit', 'button'].includes(element.type) && element.value) {
    const next = translateText(element.value);
    if (next !== element.value) element.value = next;
  }
}

function translateTree(root) {
  if (root.nodeType === 3) { translateTextNode(root); return; }
  if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
  if (root.nodeType === 1) translateAttributes(root);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === 3) translateTextNode(node);
    else translateAttributes(node);
  }
}

// Lädt das Wörterbuch und übersetzt die Seite fortlaufend.
export async function startTranslation(language) {
  document.documentElement.lang = language;
  if (language !== 'en') return;
  const module = await import('./translations/en.js');
  dictionary = module.default;
  patterns = module.patterns || [];
  document.title = translateText(document.title);
  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'characterData') translateTextNode(record.target);
      else if (record.type === 'attributes') translateAttributes(record.target);
      else record.addedNodes.forEach(translateTree);
    }
  });
  observer.observe(document.body, {
    subtree: true, childList: true, characterData: true,
    attributes: true, attributeFilter: [...ATTRIBUTES, 'value'],
  });
  translateTree(document.body);
}
