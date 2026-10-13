import { gzipSync } from 'node:zlib';

type ArchiveFile = { path: string; content: Buffer };

export function createProjectArchive(files: ArchiveFile[]): Buffer {
  const chunks: Buffer[] = [];
  for (const file of files) {
    const name = file.path.replace(/\\/g, '/');
    if (!name || name.startsWith('/') || name.split('/').some((part) => !part || part === '.' || part === '..') ||
        Buffer.byteLength(name) > 100) {
      throw new Error('Cannot export a project with an invalid path.');
    }
    const header = Buffer.alloc(512);
    writeString(header, 0, 100, name);
    writeOctal(header, 100, 8, 0o600);
    writeOctal(header, 108, 8, 0);
    writeOctal(header, 116, 8, 0);
    writeOctal(header, 124, 12, file.content.length);
    writeOctal(header, 136, 12, Math.floor(Date.now() / 1000));
    header.fill(0x20, 148, 156);
    header[156] = '0'.charCodeAt(0);
    writeString(header, 257, 6, 'ustar\0');
    writeString(header, 263, 2, '00');
    const checksum = header.reduce((sum, byte) => sum + byte, 0);
    writeOctal(header, 148, 8, checksum);
    chunks.push(header, file.content);
    const padding = (512 - (file.content.length % 512)) % 512;
    if (padding) chunks.push(Buffer.alloc(padding));
  }
  chunks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(chunks), { level: 6, maxOutputLength: 2 * 1024 * 1024 });
}

function writeString(buffer: Buffer, offset: number, length: number, value: string): void {
  buffer.write(value, offset, length, 'utf8');
}

function writeOctal(buffer: Buffer, offset: number, length: number, value: number): void {
  buffer.write(value.toString(8).padStart(length - 1, '0').slice(-(length - 1)) + '\0', offset, length, 'ascii');
}
