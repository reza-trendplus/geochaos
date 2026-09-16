export function createRedactor(secrets: string[] = []): (value: unknown) => string {
  const exact = [...new Set(secrets.filter(Boolean))].sort((a,b) => b.length-a.length);
  return (value: unknown): string => {
    let text = value instanceof Error ? value.message : String(value);
    text = text.replace(/\u001b\[[0-9;]*[A-Za-z]/g, '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '');
    for (const secret of exact) text = text.split(secret).join('[REDACTED]');
    text = text.replace(/\bBearer\s+[^\s"'<>]+/gi, 'Bearer [REDACTED]');
    text = text.replace(/\b(api[_-]?key|token|password|secret|authorization)\b(\s*[=:]\s*)[^\s,;"'<>]+/gi, '$1$2[REDACTED]');
    text = text.replace(/https?:\/\/[^\s"'<>]+/gi, raw => {
      try { return `${new URL(raw).origin}/[path-redacted]`; } catch { return '[URL REDACTED]'; }
    });
    text = text.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[EMAIL REDACTED]');
    return text.slice(0, 1800);
  };
}
export function escapeHtml(value: unknown): string {
  return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
}
