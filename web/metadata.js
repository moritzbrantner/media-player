const ID3_HEADER_LENGTH = 10;
const DEFAULT_READ_LIMIT = 1024 * 1024;

function synchsafeInteger(bytes, offset, length = 4) {
  let value = 0;
  for (let index = 0; index < length; index += 1) {
    value = (value << 7) | (bytes[offset + index] & 0x7f);
  }
  return value;
}

function unsignedInteger(bytes, offset, length) {
  let value = 0;
  for (let index = 0; index < length; index += 1) {
    value = value * 256 + bytes[offset + index];
  }
  return value;
}

function ascii(bytes) {
  return String.fromCharCode(...bytes);
}

function stripTrailingNulls(value) {
  return value.replace(/\0+$/g, "").trim();
}

function decodeUtf16(bytes, bigEndian = false) {
  if (bytes.length === 0) return "";

  let offset = 0;
  let littleEndian = !bigEndian;
  if (bytes.length >= 2) {
    if (bytes[0] === 0xff && bytes[1] === 0xfe) {
      littleEndian = true;
      offset = 2;
    } else if (bytes[0] === 0xfe && bytes[1] === 0xff) {
      littleEndian = false;
      offset = 2;
    }
  }

  let result = "";
  for (let index = offset; index + 1 < bytes.length; index += 2) {
    const codeUnit = littleEndian
      ? bytes[index] | (bytes[index + 1] << 8)
      : (bytes[index] << 8) | bytes[index + 1];
    if (codeUnit !== 0) result += String.fromCharCode(codeUnit);
  }
  return result;
}

function decodeText(bytes, encoding) {
  if (!bytes?.length) return "";
  if (encoding === 1) return stripTrailingNulls(decodeUtf16(bytes));
  if (encoding === 2) return stripTrailingNulls(decodeUtf16(bytes, true));

  const label = encoding === 3 ? "utf-8" : "windows-1252";
  return stripTrailingNulls(new TextDecoder(label).decode(bytes));
}

function decodeTextFrame(payload) {
  if (!payload?.length) return "";
  return decodeText(payload.subarray(1), payload[0]);
}

function removeUnsynchronisation(bytes) {
  const output = [];
  for (let index = 0; index < bytes.length; index += 1) {
    output.push(bytes[index]);
    if (bytes[index] === 0xff && bytes[index + 1] === 0x00) index += 1;
  }
  return Uint8Array.from(output);
}

function findTerminator(bytes, offset, encoding) {
  if (encoding === 1 || encoding === 2) {
    for (let index = offset; index + 1 < bytes.length; index += 2) {
      if (bytes[index] === 0 && bytes[index + 1] === 0) return [index, 2];
    }
    return [bytes.length, 0];
  }

  const index = bytes.indexOf(0, offset);
  return index >= 0 ? [index, 1] : [bytes.length, 0];
}

function parseAttachedPicture(payload, version) {
  if (!payload?.length) return null;

  const encoding = payload[0];
  let mimeType = "";
  let position = 1;

  if (version === 2) {
    if (payload.length < 5) return null;
    const format = ascii(payload.subarray(1, 4)).toUpperCase();
    mimeType = format === "PNG" ? "image/png" : format === "JPG" || format === "JPEG" ? "image/jpeg" : "";
    position = 4;
  } else {
    const mimeEnd = payload.indexOf(0, position);
    if (mimeEnd < 0) return null;
    mimeType = ascii(payload.subarray(position, mimeEnd)).trim().toLowerCase();
    position = mimeEnd + 1;
  }

  if (position >= payload.length) return null;
  position += 1;

  const [descriptionEnd, terminatorLength] = findTerminator(payload, position, encoding);
  position = descriptionEnd + terminatorLength;
  if (position >= payload.length || !mimeType.startsWith("image/")) return null;

  return {
    mimeType,
    data: payload.slice(position),
  };
}

function skipExtendedHeader(body, version) {
  if (body.length < 4) return body.length;
  if (version === 3) {
    const size = unsignedInteger(body, 0, 4);
    return Math.min(body.length, 4 + size);
  }
  if (version === 4) {
    const size = synchsafeInteger(body, 0, 4);
    return Math.min(body.length, Math.max(4, size));
  }
  return 0;
}

export function parseId3Metadata(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input ?? 0);
  const metadata = { title: null, artist: null, album: null, picture: null };

  if (
    bytes.length < ID3_HEADER_LENGTH ||
    bytes[0] !== 0x49 ||
    bytes[1] !== 0x44 ||
    bytes[2] !== 0x33
  ) {
    return metadata;
  }

  const version = bytes[3];
  if (![2, 3, 4].includes(version)) return metadata;

  const flags = bytes[5];
  const declaredSize = synchsafeInteger(bytes, 6, 4);
  const tagEnd = Math.min(bytes.length, ID3_HEADER_LENGTH + declaredSize);
  let body = bytes.slice(ID3_HEADER_LENGTH, tagEnd);

  if ((flags & 0x80) !== 0) body = removeUnsynchronisation(body);

  let offset = (flags & 0x40) !== 0 ? skipExtendedHeader(body, version) : 0;
  const frameHeaderLength = version === 2 ? 6 : 10;

  while (offset + frameHeaderLength <= body.length) {
    const idLength = version === 2 ? 3 : 4;
    const frameId = ascii(body.subarray(offset, offset + idLength));
    if (/^\0+$/.test(frameId) || !/^[A-Z0-9]+$/.test(frameId)) break;

    const sizeOffset = offset + idLength;
    const frameSize =
      version === 2
        ? unsignedInteger(body, sizeOffset, 3)
        : version === 4
          ? synchsafeInteger(body, sizeOffset, 4)
          : unsignedInteger(body, sizeOffset, 4);

    if (frameSize <= 0) break;

    const payloadStart = offset + frameHeaderLength;
    const payloadEnd = payloadStart + frameSize;
    if (payloadEnd > body.length) break;

    const payload = body.subarray(payloadStart, payloadEnd);
    if (frameId === "TIT2" || frameId === "TT2") metadata.title = decodeTextFrame(payload) || metadata.title;
    if (frameId === "TPE1" || frameId === "TP1") metadata.artist = decodeTextFrame(payload) || metadata.artist;
    if (frameId === "TALB" || frameId === "TAL") metadata.album = decodeTextFrame(payload) || metadata.album;
    if ((frameId === "APIC" || frameId === "PIC") && !metadata.picture) {
      metadata.picture = parseAttachedPicture(payload, version);
    }

    offset = payloadEnd;
  }

  return metadata;
}

export async function readId3Metadata(file, readLimit = DEFAULT_READ_LIMIT) {
  if (!file || typeof file.slice !== "function") {
    return { title: null, artist: null, album: null, picture: null };
  }

  const buffer = await file.slice(0, readLimit).arrayBuffer();
  return parseId3Metadata(buffer);
}
