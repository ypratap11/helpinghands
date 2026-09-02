/**
 * Sniffs a buffer's ACTUAL content by magic bytes and reports the type only
 * if it is one of the four formats this app accepts for attachments. Never
 * trusts (and never even accepts as input) a client-declared MIME type or a
 * filename/extension -- those are attacker-controlled. Returns null for
 * anything else, including a file whose extension/declared type lies about
 * its real content.
 *
 * Signatures checked:
 *   JPEG: FF D8 FF
 *   PNG:  89 50 4E 47
 *   WebP: "RIFF" at byte 0, "WEBP" at byte 8 (RIFF container)
 *   PDF:  25 50 44 46 ("%PDF")
 */
export function sniffAllowedType(bytes: Buffer): { mime: string; ext: string } | null {
  if (bytes.length < 12) return null;

  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mime: "image/jpeg", ext: "jpg" };
  }

  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return { mime: "image/png", ext: "png" };
  }

  if (
    bytes[0] === 0x52 && // R
    bytes[1] === 0x49 && // I
    bytes[2] === 0x46 && // F
    bytes[3] === 0x46 && // F
    bytes[8] === 0x57 && // W
    bytes[9] === 0x45 && // E
    bytes[10] === 0x42 && // B
    bytes[11] === 0x50 // P
  ) {
    return { mime: "image/webp", ext: "webp" };
  }

  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return { mime: "application/pdf", ext: "pdf" };
  }

  return null;
}
