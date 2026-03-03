import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

/**
 * Normalizes Odoo labels (many2one, tuples, serialized strings).
 */
export function normalizeLabel(val: any): string {
    if (val === null || val === undefined) return "—";

    // Handle Array [id, name]
    if (Array.isArray(val) && val.length >= 2) {
        return String(val[1]);
    }

    // Handle Object {id, name}
    if (typeof val === 'object' && val !== null && 'name' in val) {
        return String(val.name);
    }

    const str = String(val).trim();

    // Handle serialized tuple string like "(365, 'NAME')" or "[365, 'NAME']"
    const tupleMatch = str.match(/[(\[]\d+,\s*['"]?(.+?)['"]?[)\]]/);
    if (tupleMatch) {
        let clean = tupleMatch[1].trim();
        // Remove trailing quotes if regex was loose
        if (clean.endsWith("'") || clean.endsWith('"')) {
            clean = clean.slice(0, -1);
        }
        return clean;
    }

    // General cleanup: remove multiple newlines and extra spaces
    return str.replace(/\s+/g, ' ');
}

/**
 * Formats the "Obra" display name by removing unwanted numeric prefixes.
 * Pattern: ^\d+[,]?\s* - Strips leading digits, an optional comma, and optional whitespace.
 */
export function formatObraDisplayName(value?: string | null): string {
    if (!value) return "—";
    const text = normalizeLabel(value);
    // Remove leading digits + optional comma + optional trailing space
    return text.replace(/^\d+[,]?\s*/, "");
}
