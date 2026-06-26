// Read a Google Sheet as CSV via its public export endpoint (no API key). Works
// only when the sheet is "Anyone with the link can view". Read-only by design.
import { errMsg } from '../lib/util.js';

// Pull the spreadsheet id and tab gid out of a pasted edit URL, e.g.
//   https://docs.google.com/spreadsheets/d/<ID>/edit?gid=<GID>#gid=<GID>
export function parseSheetUrl(url: string): { id: string; gid: string } {
  const id = String(url).match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)?.[1];
  if (!id) throw new Error('Link Google Sheets không hợp lệ (thiếu /spreadsheets/d/<id>).');
  const gid = String(url).match(/[?&#]gid=(\d+)/)?.[1] || '0';
  return { id, gid };
}

export function sheetCsvUrl({ id, gid }: { id: string; gid: string }): string {
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
}

// Returns { id, gid, text }. Throws a plain-language error if the sheet isn't
// publicly viewable (Google answers with an HTML login page, not CSV).
export async function fetchSheetCsv(
  url: string,
): Promise<{ id: string; gid: string; text: string }> {
  const { id, gid } = parseSheetUrl(url);
  let res: Response;
  try {
    res = await fetch(sheetCsvUrl({ id, gid }), { redirect: 'follow' });
  } catch (e) {
    throw new Error(`Không kết nối được Google Sheets: ${errMsg(e)}`, { cause: e });
  }
  if (!res.ok) {
    throw new Error(
      `Tải Sheet lỗi (HTTP ${res.status}). Đặt sheet ở chế độ "Anyone with the link can view".`,
    );
  }
  const text = await res.text();
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('csv') || text.trimStart().startsWith('<')) {
    throw new Error('Sheet chưa công khai — đặt "Anyone with the link can view" rồi thử lại.');
  }
  return { id, gid, text };
}
