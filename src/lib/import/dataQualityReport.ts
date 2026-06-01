export type SuspiciousCountableRow = {
  check_type: string;
  occurrence_count: number;
};

export function csvEscape(value: unknown) {
  if (value == null) return "";
  const text = value instanceof Date ? value.toISOString() : String(value);
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

export function formatCsv<T extends Record<string, unknown>>(rows: T[], columns: (keyof T)[]) {
  const lines = [`${columns.join(",")}`];
  for (const row of rows) lines.push(columns.map((column) => csvEscape(row[column])).join(","));
  return `${lines.join("\n")}\n`;
}

export function summarizeSuspiciousRows(rows: SuspiciousCountableRow[]) {
  return rows.reduce<Record<string, number>>((counts, row) => {
    counts[row.check_type] = (counts[row.check_type] ?? 0) + row.occurrence_count;
    return counts;
  }, {});
}
