// Tiny argv parser shared by every CLI entry point.
// Supports boolean flags (--dry) and valued flags (--file=path).
const ARGV = process.argv.slice(2);

export const flag = (name: string, argv: string[] = ARGV): boolean => argv.includes(`--${name}`);

export const flagVal = (name: string, argv: string[] = ARGV): string | null => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : null;
};
