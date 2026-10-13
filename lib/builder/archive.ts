type ArchiveFile = { path: string; content: Buffer };

const crcTable = new Uint32Array(256);
for (let index = 0; index < crcTable.length; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  crcTable[index] = value >>> 0;
}

export function createProjectArchive(files: ArchiveFile[]): Buffer {
  if (files.length > 0xffff) throw new Error('Cannot export more files than the ZIP format supports.');
  const chunks: Buffer[] = [];
  const centralDirectory: Buffer[] = [];
  const [dosTime, dosDate] = getDosTimestamp(new Date());
  let offset = 0;
  let centralDirectorySize = 0;
  const seen = new Set<string>();

  for (const file of files) {
    const name = file.path.replace(/\\/g, '/');
    if (!name || name.startsWith('/') || /[\0<>:"|?*]/.test(name) ||
        name.split('/').some((part) => !part || part === '.' || part === '..') ||
        Buffer.byteLength(name, 'utf8') > 0xffff || seen.has(name)) {
      throw new Error('Cannot export a project with an invalid or duplicate path.');
    }
    seen.add(name);
    if (file.content.length > 0xffffffff) throw new Error('Cannot export a file larger than the ZIP format supports.');

    const nameBytes = Buffer.from(name, 'utf8');
    const checksum = crc32(file.content);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(file.content.length, 18);
    localHeader.writeUInt32LE(file.content.length, 22);
    localHeader.writeUInt16LE(nameBytes.length, 26);
    localHeader.writeUInt16LE(0, 28);
    chunks.push(localHeader, nameBytes, file.content);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(file.content.length, 20);
    centralHeader.writeUInt32LE(file.content.length, 24);
    centralHeader.writeUInt16LE(nameBytes.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralDirectory.push(centralHeader, nameBytes);

    offset += localHeader.length + nameBytes.length + file.content.length;
    centralDirectorySize += centralHeader.length + nameBytes.length;
  }

  const centralDirectoryOffset = offset;
  const endOfCentralDirectory = Buffer.alloc(22);
  endOfCentralDirectory.writeUInt32LE(0x06054b50, 0);
  endOfCentralDirectory.writeUInt16LE(0, 4);
  endOfCentralDirectory.writeUInt16LE(0, 6);
  endOfCentralDirectory.writeUInt16LE(files.length, 8);
  endOfCentralDirectory.writeUInt16LE(files.length, 10);
  endOfCentralDirectory.writeUInt32LE(centralDirectorySize, 12);
  endOfCentralDirectory.writeUInt32LE(centralDirectoryOffset, 16);
  endOfCentralDirectory.writeUInt16LE(0, 20);

  return Buffer.concat([...chunks, ...centralDirectory, endOfCentralDirectory]);
}

function crc32(content: Buffer): number {
  let checksum = 0xffffffff;
  for (let index = 0; index < content.length; index += 1) {
    checksum = (crcTable[(checksum ^ content[index]) & 0xff] ?? 0) ^ (checksum >>> 8);
  }
  return (checksum ^ 0xffffffff) >>> 0;
}

function getDosTimestamp(date: Date): [number, number] {
  const year = Math.max(1980, Math.min(date.getFullYear(), 2107));
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return [time, day];
}
