import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

/**
 * Formats the "Obra" display name by removing unwanted numeric prefixes.
 * Pattern: ^\d+[,]?\s* - Strips leading digits, an optional comma, and optional whitespace.
 */
export function formatObraDisplayName(value?: string | null): string {
    if (!value) return "-";
    const text = String(value).trim();
    // Remove leading digits + optional comma + optional trailing space
    return text.replace(/^\d+[,]?\s*/, "");
}
