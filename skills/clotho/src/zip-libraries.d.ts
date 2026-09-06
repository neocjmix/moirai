declare module "yazl" {
  import type { PassThrough } from "node:stream";

  interface EntryOptions {
    readonly compress?: boolean;
    readonly mode?: number;
    readonly forceZip64Format?: boolean;
  }

  export class ZipFile {
    readonly outputStream: PassThrough;
    addBuffer(
      buffer: Buffer,
      metadataPath: string,
      options?: EntryOptions
    ): void;
    end(options?: { forceZip64Format?: boolean; comment?: string }): void;
    on(event: "error", listener: (error: Error) => void): this;
  }
}

declare module "yauzl" {
  import type { Readable } from "node:stream";

  export interface Entry {
    readonly fileName: string;
    readonly externalFileAttributes: number;
    readonly uncompressedSize: number;
    readonly compressedSize: number;
    isEncrypted(): boolean;
  }

  interface ZipFile {
    close(): void;
    readEntry(): void;
    openReadStream(
      entry: Entry,
      callback: (error: Error | null, stream?: Readable) => void
    ): void;
    on(event: "entry", listener: (entry: Entry) => void): this;
    on(event: "error", listener: (error: Error) => void): this;
    on(event: "end", listener: () => void): this;
  }

  export function fromBuffer(
    buffer: Buffer,
    options: {
      lazyEntries?: boolean;
      validateEntrySizes?: boolean;
      strictFileNames?: boolean;
    },
    callback: (error: Error | null, zip?: ZipFile) => void
  ): void;
}
