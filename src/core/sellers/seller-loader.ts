import { readFileSync, existsSync } from 'node:fs';
import { extname } from 'node:path';
import { parse } from 'csv-parse/sync';
import readXlsxFile from 'read-excel-file/node';
import { validateSellers } from './seller-validator.js';
import type { ValidationResult } from '../types.js';

// Async because Excel parsing is. Returns an array of { column: value },
// preserving EVERY column and the header order — the enrich tool reads it directly
// (it must keep all columns to write the result file), unlike validateSellers
// which projects rows down to the Seller shape.
export async function readRows(filePath: string): Promise<Record<string, any>[]> {
  const ext = extname(filePath).toLowerCase();

  if (ext === '.xlsx' || ext === '.xls') {
    // read-excel-file/node returns [{ sheet, data: [[...row]] }]; take the first sheet.
    const sheets = await readXlsxFile(filePath);
    const matrix = Array.isArray(sheets) && sheets[0]?.data ? sheets[0].data : [];
    if (!matrix.length) return [];
    const header = matrix[0].map((h: unknown) => String(h ?? '').trim());
    return matrix.slice(1).map((row: unknown[]) => {
      const obj: Record<string, any> = {};
      header.forEach((h: string, i: number) => {
        obj[h] = row[i] == null ? '' : String(row[i]).trim();
      });
      return obj;
    });
  }

  const raw = readFileSync(filePath, 'utf8');
  return parseCsv(raw);
}

// Excel "Save as CSV" uses ';' or a tab in many locales — pick whichever splits
// the header into the most fields so a salesperson's export just works.
function sniffDelimiter(raw: string): string {
  const header =
    String(raw)
      .replace(/^\uFEFF/, '')
      .split(/\r?\n/, 1)[0] || '';
  return [',', ';', '\t'].reduce(
    (best, d) => (header.split(d).length > header.split(best).length ? d : best),
    ',',
  );
}

// Uniquify blank/duplicate header cells (empty → col_i, dup → name_i) so a Google
// Sheet export never crashes csv-parse; the validator reads only named columns.
export function parseCsv(raw: string): Record<string, any>[] {
  return parse(raw, {
    bom: true, // strip the BOM from Excel "CSV UTF-8" exports
    delimiter: sniffDelimiter(raw),
    skip_empty_lines: true,
    trim: true,
    columns: (firstRow: string[]) => {
      const seen = new Set<string>();
      return firstRow.map((name, i) => {
        let key = String(name ?? '').trim() || `col_${i}`;
        if (seen.has(key)) key = `${key}_${i}`;
        seen.add(key);
        return key;
      });
    },
  }) as Record<string, any>[];
}

export async function loadSellers(filePath: string): Promise<ValidationResult> {
  if (!filePath || !existsSync(filePath)) {
    throw new Error(`Không tìm thấy file: ${filePath}`);
  }
  const rawRows = await readRows(filePath);
  if (!rawRows.length) throw new Error('File rỗng hoặc không đọc được dữ liệu.');
  return validateSellers(rawRows);
}
