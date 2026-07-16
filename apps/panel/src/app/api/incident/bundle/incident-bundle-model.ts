export function redactIncidentText(text: string) {
  return text
    .replace(/(["']?(?:token|password|secret|api[-_ ]?key)["']?\s*[:=]\s*["']?)[^"'\s,}]+/gi, '$1[redacted]')
    .replace(/\bBearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/([?&](?:token|key|secret|signature)=)[^&#\s]+/gi, '$1[redacted]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted-email]')
    .replace(/(?:^|\s)(?:\/[\w.-]+){3,}(?=\s|$)/g, ' [redacted-path]');
}
