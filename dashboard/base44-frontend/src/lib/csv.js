// CSV-Import und -Export ohne externe Bibliothek.

export function detectDelimiter(text) {
  const firstLine = String(text).split(/\r?\n/).find((l) => l.trim().length) || '';
  const candidates = [';', ',', '\t'];
  let best = ';';
  let bestCount = -1;
  candidates.forEach((d) => {
    const count = firstLine.split(d).length - 1;
    if (count > bestCount) {
      best = d;
      bestCount = count;
    }
  });
  return bestCount > 0 ? best : ';';
}

function splitLine(line, delimiter) {
  const cells = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells.map((c) => c.trim());
}

/** Liest CSV-Text ein und liefert Kopfzeile sowie Objektzeilen. */
export function parseCsv(text) {
  const clean = String(text || '').replace(/^\uFEFF/, '');
  const delimiter = detectDelimiter(clean);
  const lines = clean.split(/\r?\n/).filter((l) => l.trim().length);
  if (!lines.length) return { headers: [], rows: [], delimiter };
  const headers = splitLine(lines[0], delimiter).map((h) => h.replace(/^"|"$/g, '').trim());
  const rows = lines.slice(1).map((line) => {
    const cells = splitLine(line, delimiter);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] !== undefined ? cells[index] : '';
    });
    return row;
  });
  return { headers, rows, delimiter };
}

export function buildCsv(columns, rows) {
  const escape = (value) => {
    if (value === null || value === undefined) return '';
    const str = String(value);
    return /[";\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const head = columns.map((c) => escape(c.label)).join(';');
  const body = rows.map((row) => columns.map((c) => escape(typeof c.value === 'function' ? c.value(row) : row[c.key])).join(';'));
  return [head, ...body].join('\r\n');
}

export function downloadText(filename, content, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden.'));
    reader.readAsText(file, 'utf-8');
  });
}

/** Erkennt das deutsche Zahlenformat (1.234,5) und ISO-Zahlen. */
export function parseNumber(value) {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw;
  const num = Number(normalized);
  return Number.isNaN(num) ? null : num;
}
