// Reads width and height from a PNG's IHDR chunk.
export function pngSize(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47 || buf.toString('latin1', 12, 16) !== 'IHDR') throw new Error('not a PNG');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

// Reads the value of a tEXt chunk by its key; undefined when the PNG has none.
export function pngText(buf, key) {
  for (let at = 8; at + 12 <= buf.length; at += 12 + buf.readUInt32BE(at)) {
    if (buf.toString('latin1', at + 4, at + 8) !== 'tEXt') continue;
    const data = buf.toString('latin1', at + 8, at + 8 + buf.readUInt32BE(at));
    const nul = data.indexOf('\0');
    if (data.slice(0, nul) === key) return data.slice(nul + 1);
  }
  return undefined;
}
