import { describe, expect, it } from "vitest";
import { sniffAllowedType } from "@/lib/fileType";

/**
 * Real magic-byte signatures for each accepted format, padded with a little
 * plausible body content so the buffer isn't suspiciously tiny. These are
 * the actual leading bytes real encoders emit -- not just "close enough"
 * fakes -- because sniffAllowedType must never trust a filename or a
 * declared MIME type, only these bytes.
 */
function bytes(...groups: number[][]): Buffer {
  return Buffer.from(groups.flat());
}

const JPEG = bytes([0xff, 0xd8, 0xff, 0xe0], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
const PNG = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], [0, 0, 0, 0, 0, 0, 0, 0]);
const PDF = bytes([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34], [0, 0, 0, 0]);

function webp(): Buffer {
  // RIFF <4-byte size> WEBP -- the size field's actual value doesn't matter
  // to the sniffer, only that bytes 0-3 are "RIFF" and bytes 8-11 "WEBP".
  const riff = Buffer.from("RIFF", "ascii");
  const size = Buffer.from([0x24, 0x00, 0x00, 0x00]);
  const webpTag = Buffer.from("WEBP", "ascii");
  const rest = Buffer.from([0x56, 0x50, 0x38, 0x20, 0, 0, 0, 0]);
  return Buffer.concat([riff, size, webpTag, rest]);
}

describe("sniffAllowedType", () => {
  it("accepts a real JPEG signature", () => {
    expect(sniffAllowedType(JPEG)).toEqual({ mime: "image/jpeg", ext: "jpg" });
  });

  it("accepts a real PNG signature", () => {
    expect(sniffAllowedType(PNG)).toEqual({ mime: "image/png", ext: "png" });
  });

  it("accepts a real WebP signature", () => {
    expect(sniffAllowedType(webp())).toEqual({ mime: "image/webp", ext: "webp" });
  });

  it("accepts a real PDF signature", () => {
    expect(sniffAllowedType(PDF)).toEqual({ mime: "application/pdf", ext: "pdf" });
  });

  it("rejects a plain text file", () => {
    const text = Buffer.from("Hello, this is just a plain text file.\n", "ascii");
    expect(sniffAllowedType(text)).toBeNull();
  });

  it("rejects an SVG (XML text, not a raster format we accept)", () => {
    const svg = Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"></svg>', "ascii");
    expect(sniffAllowedType(svg)).toBeNull();
  });

  it("rejects a Windows PE executable header (MZ)", () => {
    const exe = bytes([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00], [0, 0, 0, 0]);
    expect(sniffAllowedType(exe)).toBeNull();
  });

  it("rejects an ELF executable header", () => {
    const elf = bytes([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00], [0, 0, 0, 0]);
    expect(sniffAllowedType(elf)).toBeNull();
  });

  it("rejects a file whose extension lies about its content (a .png that is really a text file)", () => {
    // The sniffer only ever sees bytes -- there is no filename parameter at
    // all -- so this test documents that an attacker-controlled filename
    // like "totally-a-photo.png" cannot influence the result.
    const fakePng = Buffer.from("I am not really a PNG, just named like one.", "ascii");
    expect(sniffAllowedType(fakePng)).toBeNull();
  });

  it("rejects an empty buffer", () => {
    expect(sniffAllowedType(Buffer.alloc(0))).toBeNull();
  });

  it("rejects a buffer too short to contain any signature", () => {
    expect(sniffAllowedType(Buffer.from([0xff, 0xd8]))).toBeNull();
  });

  it("rejects a RIFF file that isn't WEBP (e.g. a WAV)", () => {
    const riff = Buffer.from("RIFF", "ascii");
    const size = Buffer.from([0x24, 0x00, 0x00, 0x00]);
    const waveTag = Buffer.from("WAVE", "ascii");
    const rest = Buffer.from([0, 0, 0, 0, 0, 0, 0, 0]);
    const wav = Buffer.concat([riff, size, waveTag, rest]);
    expect(sniffAllowedType(wav)).toBeNull();
  });
});
