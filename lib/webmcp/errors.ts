export const E = {
  NO_OPEN: 'No invoice is open. Call open_invoice with an id from list_invoices.',
  NOT_FOUND: (id: string) => `Invoice "${id}" not found. Call list_invoices to see valid ids.`,
  DECISION_NOT_FOUND: (id: string) => `Decision "${id}" not found. Use the decision_id returned by request_countersign.`,
  FIELD: (key: string, valid: string[]) => `Unknown field "${key}". Valid keys: ${valid.join(', ')}.`,
  LINE: (n: number, total: number) => `Line ${n} does not exist. This invoice has ${total} lines (1–${total}).`,
  GL: (code: string, valid: string[]) => `Unknown GL code "${code}". Valid codes: ${valid.join(', ')}.`,
};
