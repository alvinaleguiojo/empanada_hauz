declare module "multer" {
  export type StorageEngine = unknown;
  export function diskStorage(options: {
    destination: (request: unknown, file: { originalname: string }, callback: (error: Error | null, destination: string) => void) => void;
    filename: (request: unknown, file: { originalname: string }, callback: (error: Error | null, filename: string) => void) => void;
  }): unknown;
}
