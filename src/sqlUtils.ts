export function escapeSqlIdentifier(identifier: string): string {
	return identifier.replace(/"/g, '""');
}
