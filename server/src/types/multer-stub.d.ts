// Minimal stub so TypeScript can resolve 'multer' types when @types/multer
// isn't installed in the local workspace. The runtime still uses the real
// package; this only satisfies the compiler.
declare module 'multer' {
  import type { RequestHandler } from 'express';

  interface MulterFile {
    /** field name specified in the form */
    fieldname: string;
    /** name of the file on the user's computer */
    originalname: string;
    /** encoding type of the file */
    encoding: string;
    /** mime type of the file */
    mimetype: string;
    /** size of the file in bytes */
    size: number;
    /** `Buffer` of the entire file */
    buffer: Buffer;
    /** A readable stream of file contents */
    stream: NodeJS.ReadableStream;
    /** Destination folder (DiskStorage) */
    destination?: string;
    /** File name within destination (DiskStorage) */
    filename?: string;
    /** Full path (DiskStorage) */
    path?: string;
  }

  type FileFilterCallback = (error: Error | null, acceptFile?: boolean) => void;

  interface MulterOptions {
    storage?: any;
    limits?: {
      fileSize?: number;
      files?: number;
      fields?: number;
    };
    fileFilter?: (req: any, file: MulterFile, cb: FileFilterCallback) => void;
  }

  interface MulterInstance {
    single(fieldname: string): RequestHandler;
    array(fieldname: string, maxCount?: number): RequestHandler;
    fields(fields: { name: string; maxCount?: number }[]): RequestHandler;
    any(): RequestHandler;
  }

  function multer(options?: MulterOptions): MulterInstance;
  export = multer;
  export type File = MulterFile;
  export type FileFilterCallback = FileFilterCallback;
}
