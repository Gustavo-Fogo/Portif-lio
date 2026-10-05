// Leitura de planilhas (.xlsx / .csv) com SheetJS — carregado só na importação
import * as XLSX from 'xlsx';

export * from './parse.js';

// ---------- Leitura ----------
export function readWorkbook(data, filename = '') {
  const isCSV = /\.(csv|txt)$/i.test(filename);
  if (isCSV) {
    const text = typeof data === 'string' ? data : new TextDecoder('utf-8').decode(data);
    return XLSX.read(text, { type: 'string', cellDates: true, raw: false, FS: guessCSVSeparator(text) });
  }
  return XLSX.read(data, { type: 'array', cellDates: true });
}

function guessCSVSeparator(text) {
  const first = text.split(/\r?\n/).find((l) => l.trim()) || '';
  const counts = { ';': (first.match(/;/g) || []).length, ',': (first.match(/,/g) || []).length, '\t': (first.match(/\t/g) || []).length };
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][1] > 0 ? Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] : ',';
}

/** Linhas de uma aba: valores brutos e texto formatado (para detectar moeda). */
export function sheetRows(wb, sheetName) {
  const ws = wb.Sheets[sheetName];
  if (!ws) return { raw: [], text: [] };
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '', blankrows: false });
  const text = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '', blankrows: false });
  return { raw, text };
}

