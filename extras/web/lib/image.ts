// Magic-byte and dimension checks for uploaded images. No decoding: header parsing only.
import { ApiError } from './errors';

export const MAX_STICKER_BYTES = 400 * 1024;
export const MAX_AVATAR_BYTES = 250 * 1024;
export const MAX_DIM = 1024;
export const AVATAR_MIMES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export type AvatarMime = (typeof AVATAR_MIMES)[number];

const u32 = (b: Uint8Array, o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const ascii = (b: Uint8Array, o: number, n: number) => String.fromCharCode(...b.subarray(o, o + n));
const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function isPng(b: Uint8Array) {
  return b.length >= 33 && PNG_SIG.every((v, i) => b[i] === v) && ascii(b, 12, 4) === 'IHDR';
}
const isJpeg = (b: Uint8Array) => b.length > 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
const isWebp = (b: Uint8Array) => b.length > 30 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP';

export function detect(b: Uint8Array): AvatarMime | null {
  return isPng(b) ? 'image/png' : isJpeg(b) ? 'image/jpeg' : isWebp(b) ? 'image/webp' : null;
}

/** Pixel size from the header, or null when it cannot be read. */
export function dimensions(b: Uint8Array, mime: AvatarMime): { w: number; h: number } | null {
  if (mime === 'image/png') return { w: u32(b, 16), h: u32(b, 20) };
  if (mime === 'image/jpeg') {
    let o = 2;
    while (o + 9 < b.length) {
      if (b[o] !== 0xff) { o++; continue; }
      const m = b[o + 1];
      if (m === 0xff) { o++; continue; }
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { o += 2; continue; }
      const len = (b[o + 2] << 8) | b[o + 3];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: (b[o + 5] << 8) | b[o + 6], w: (b[o + 7] << 8) | b[o + 8] };
      o += 2 + len;
    }
    return null;
  }
  const k = ascii(b, 12, 4);
  if (k === 'VP8X') return { w: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), h: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) };
  if (k === 'VP8L') return { w: 1 + (b[21] | ((b[22] & 0x3f) << 8)), h: 1 + (((b[22] >> 6) | (b[23] << 2) | ((b[24] & 0x0f) << 10)) & 0x3fff) };
  if (k === 'VP8 ') return { w: (b[26] | (b[27] << 8)) & 0x3fff, h: (b[28] | (b[29] << 8)) & 0x3fff };
  return null;
}

/** Throws 415 / 400 unless `bytes` is a real image of one of `allowed` mimes within 1024 x 1024. */
export function checkImage(bytes: Uint8Array, allowed: readonly AvatarMime[]): AvatarMime {
  const mime = detect(bytes);
  if (!mime || !allowed.includes(mime)) throw new ApiError(415, 'unsupported_media', `body is not a valid ${allowed.map((m) => m.split('/')[1]).join('/')} image`);
  const d = dimensions(bytes, mime);
  if (!d || d.w < 1 || d.h < 1) throw new ApiError(400, 'invalid_image', 'cannot read image dimensions');
  if (d.w > MAX_DIM || d.h > MAX_DIM) throw new ApiError(400, 'invalid_image', `image is ${d.w}x${d.h}; max ${MAX_DIM}x${MAX_DIM}`);
  return mime;
}
