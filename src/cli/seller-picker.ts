// Shared seller picker for the one-by-one flows (SMTP send + Outlook draft), so
// the "what's still mailable" rule and the search prompt can never drift apart.
import { search } from '@inquirer/prompts';
import type { Seller } from '../core/types.js';

const QUIT = '__quit__';
const SWITCH = '__switch_template__';
// Returned by pickSeller when the operator chooses to stop the session.
export const PICK_QUIT = Symbol('pick-quit');
// Returned when the operator chooses to switch the mail design mid-session.
export const PICK_SWITCH = Symbol('pick-switch');

// Still mailable: not already sent, not suppressed. Recomputed each round.
export function remainingSellers(sellers: Seller[], campaign: any, suppression: any): Seller[] {
  const done: Set<string> = campaign.loadSent();
  const blocked: Set<string> = suppression.loadSet();
  return sellers.filter((s) => !done.has(s.email) && !blocked.has(s.email));
}

// Pick one seller (type to filter) → PICK_QUIT / PICK_SWITCH / null / the seller.
// templateLabel (when set) adds a "↻ Đổi mẫu mail" entry.
export async function pickSeller(
  remaining: Seller[],
  { message, templateLabel }: { message: string; templateLabel?: string },
): Promise<Seller | typeof PICK_QUIT | typeof PICK_SWITCH | null> {
  const choice = await search<string>({
    message,
    source: (term) => {
      const t = (term || '').toLowerCase();
      const hits = remaining.filter(
        (s) => !t || `${s.seller_name} ${s.email} ${s.phone}`.toLowerCase().includes(t),
      );
      return [
        ...hits.slice(0, 50).map((s) => ({
          name: `${s.seller_name} · ${s.email}${s.phone ? ' · ' + s.phone : ''}`,
          value: s.email,
        })),
        // Don't let the 50-row cap read as "that's everyone" — say how many more
        // matched so the operator knows to narrow the filter.
        ...(hits.length > 50
          ? [
              {
                name: `… và ${hits.length - 50} người nữa — gõ thêm để lọc hẹp hơn`,
                value: '__more__',
                disabled: true,
              },
            ]
          : []),
        ...(templateLabel
          ? [{ name: `↻ Đổi mẫu mail (đang dùng: ${templateLabel})`, value: SWITCH }]
          : []),
        { name: '— Thoát —', value: QUIT },
      ];
    },
  });
  if (choice === QUIT) return PICK_QUIT;
  if (choice === SWITCH) return PICK_SWITCH;
  return remaining.find((s) => s.email === choice) || null;
}
