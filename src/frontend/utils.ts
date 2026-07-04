export function escapeForHtml(str: string): string {
  const result = str
    .normalize() // normalize Unicode first
    .replace(/&/g, '&amp;') // & must be first
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  return result.trim();
}
