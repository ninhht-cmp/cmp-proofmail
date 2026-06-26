// Terminal presentation only — core never touches this. Terracotta orange is the
// brand accent; green/yellow/red are reserved for state (ok / warning / error).
import chalk from 'chalk';
import cliProgress from 'cli-progress';

const ORANGE = '#D97757'; // Claude terracotta — dominant accent
const SAND = '#E8B796';

export const c = {
  brand: chalk.hex(ORANGE),
  brandBold: chalk.hex(ORANGE).bold,
  sand: chalk.hex(SAND),
  bold: chalk.bold,
  dim: chalk.dim,
  ok: chalk.green,
  warn: chalk.yellow,
  err: chalk.red,
};

type Tone = 'ok' | 'warn' | 'err';
type SummaryRow = readonly [string, string | number, Tone?];

export const ui = {
  title: (t: string) => console.log('\n' + c.brandBold(t)),
  step: (n: string, t: string) => console.log('\n' + c.brandBold(`  ${n} `) + c.bold(t)),
  ok: (t: string) => console.log(c.ok('  ✓ ') + t),
  warn: (t: string) => console.log(c.warn('  ⚠ ') + t),
  err: (t: string) => console.log(c.err('  ✗ ') + t),
  info: (t: string) => console.log(c.brand('  ● ') + t),
  dim: (t: string) => console.log(c.dim('  ' + t)),
  line: () => console.log(c.dim('  ' + '─'.repeat(50))),
  bold: c.bold,
  // Compact result panel of [label, value, tone?] rows. Falsy rows are skipped so
  // callers can pass `cond ? [label, value, tone] : null` inline.
  summary: (title: string, rows: any[]) => {
    const shown = rows.filter(Boolean) as SummaryRow[];
    const labelW = Math.max(...shown.map(([l]) => l.length), 0);
    const glyph = (tone?: Tone) =>
      tone === 'ok'
        ? c.ok('✓')
        : tone === 'warn'
          ? c.warn('⚠')
          : tone === 'err'
            ? c.err('✗')
            : c.brand('●');
    console.log('\n' + c.brandBold('  ' + title));
    console.log(c.dim('  ' + '─'.repeat(Math.max(labelW + 14, 30))));
    for (const [label, value, tone] of shown) {
      console.log(`  ${glyph(tone)} ${label.padEnd(labelW)}   ${c.bold(String(value))}`);
    }
    console.log(c.dim('  ' + '─'.repeat(Math.max(labelW + 14, 30))));
  },
};

export function banner(version?: string): void {
  console.clear();
  // Adapt to the terminal width (clamped [40,60]) so the box never overflows.
  const w = Math.max(40, Math.min((process.stdout.columns || 60) - 2, 60));
  const top = '╭' + '─'.repeat(w) + '╮';
  const bot = '╰' + '─'.repeat(w) + '╯';
  const pad = (s: string, len: number) => s + ' '.repeat(Math.max(0, len - s.length));
  const name = version ? `PROOFMAIL  v${version}` : 'PROOFMAIL';
  console.log(c.brand(top));
  console.log(c.brand('│ ') + c.brandBold('✻ ') + c.bold(pad(name, w - 4)) + c.brand(' │'));
  console.log(
    c.brand('│ ') + c.dim(pad('Gửi thông tin gian hàng tới người bán', w - 2)) + c.brand(' │'),
  );
  console.log(c.brand(bot));
}

// Honest spinner: spins only while a real awaited op runs (screenshot / SMTP +
// IMAP), then clears itself — no fake delay. update() swaps the label per phase.
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export interface Spinner {
  start(t?: string): Spinner;
  update(t: string): void;
  stop(): void;
}

export function makeSpinner(label: string): Spinner {
  let i = 0;
  let timer: ReturnType<typeof setInterval> | null = null;
  let text = label;
  const tty = process.stdout.isTTY;
  const render = () => {
    i = (i + 1) % SPINNER_FRAMES.length;
    process.stdout.write(`\r  ${c.brand(SPINNER_FRAMES[i])} ${text}   `);
  };
  const spinner: Spinner = {
    start(t) {
      if (t) text = t;
      // No TTY (piped/CI): print one static line, don't animate (avoids \r spam).
      if (!tty) {
        console.log(c.brand('  ● ') + text);
        return spinner;
      }
      render();
      timer = setInterval(render, 80);
      return spinner;
    },
    update(t) {
      text = t;
      if (!tty) console.log(c.brand('  ● ') + text);
    },
    // Wipe the spinner line so the caller's ui.ok/err prints cleanly in its place.
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
      if (tty) process.stdout.write('\r' + ' '.repeat(text.length + 12) + '\r');
    },
  };
  return spinner;
}

// Human "time left" for hours-long runs (cli-progress only gives raw seconds).
function etaText(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '';
  if (seconds < 90) return `~${Math.round(seconds)}s còn lại`;
  const mins = seconds / 60;
  if (mins < 90) return `~${Math.round(mins)} phút còn lại`;
  return `~${(mins / 60).toFixed(1)} giờ còn lại`;
}

export interface ProgressBar {
  start(total: number, startValue?: number, payload?: { suffix?: string }): void;
  update(value: number, payload?: { suffix?: string }): void;
  stop(): void;
}

// One orange bar with a human ETA, shared by capture / send.
export function makeProgressBar(label: string): ProgressBar {
  // Non-TTY (piped/CI): print milestone lines instead of a redrawing bar.
  if (!process.stdout.isTTY) {
    let total = 0;
    let lastPct = -1;
    return {
      start(t: number) {
        total = t || 0;
        console.log(c.brand('  ● ') + `${label}: 0/${total}`);
      },
      update(value: number, payload: { suffix?: string } = {}) {
        const pct = total ? Math.floor((value / total) * 100) : 0;
        if (pct >= lastPct + 25 || value >= total) {
          lastPct = pct;
          console.log(c.dim(`  ${label}: ${value}/${total} (${pct}%) ${payload.suffix || ''}`));
        }
      },
      stop() {},
    };
  }
  const size = 24;
  return new cliProgress.SingleBar(
    {
      // Custom formatter: colored bar + live ETA from params.
      format: (options: any, params: any, payload: any) => {
        const done = Math.min(size, Math.round((params.progress || 0) * size));
        const bar = c.brand('█'.repeat(done)) + c.dim('░'.repeat(size - done));
        const eta = etaText(params.eta);
        return `  ${bar} ${params.value}/${params.total} ${c.dim(label)} ${payload.suffix || ''}${eta ? '  ' + c.dim(eta) : ''}`;
      },
      barsize: size,
      hideCursor: true,
      clearOnComplete: false,
      etaBuffer: 50,
      fps: 10,
    },
    cliProgress.Presets.legacy,
  );
}
