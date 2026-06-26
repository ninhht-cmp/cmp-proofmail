// Pick the mail design for this session (MAIL_TEMPLATE is the default). Designs
// are discovered from templates/<name>.hbs, so adding one needs no code change.
import { select } from '@inquirer/prompts';
import { listTemplates } from '../adapters/storage.js';
import { ui, c } from './ui.js';

// The default design keeps the legacy un-suffixed campaign id, so sent-history
// from before per-design scoping survives; other designs get a suffixed store.
export const DEFAULT_TEMPLATE = 'touch';

// Campaign store id for a (list, design) pair — shared by all flows so a design
// can't be tracked under two ids.
export function campaignIdFor(fileBase: string, template: string): string {
  return template === DEFAULT_TEMPLATE ? fileBase : `${fileBase}__${template}`;
}

// With 0–1 designs there's nothing to choose — keep `current`, never block the run.
export async function pickTemplate({
  current = 'touch',
}: { current?: string } = {}): Promise<string> {
  const templates = listTemplates();
  if (templates.length <= 1) {
    if (templates.length === 1 && templates[0] !== current) {
      ui.dim(`Chỉ có 1 mẫu mail (${templates[0]}) — dùng mẫu này.`);
      return templates[0];
    }
    return current;
  }
  return select({
    message: 'Chọn mẫu mail cho phiên này:',
    default: templates.includes(current) ? current : templates[0],
    choices: templates.map((name) => ({
      name: name === current ? `${name} ${c.dim('(mặc định)')}` : name,
      value: name,
    })),
  });
}
