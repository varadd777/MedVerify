export function renderTemplate(template, ctx = {}) {
  if (!template) return '';
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
    const k = key.trim();
    return ctx[k] !== undefined && ctx[k] !== null ? String(ctx[k]) : '';
  });
}