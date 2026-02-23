/**
 * Type declaration for @modelcontextprotocol/sdk/server/stdio.
 * The package does not expose this subpath in its TypeScript exports; runtime resolution works via package "./*" export.
 */
declare module '@modelcontextprotocol/sdk/server/stdio' {
  import type { Readable, Writable } from 'node:stream';

  export class StdioServerTransport {
    constructor(stdin?: Readable, stdout?: Writable);
    start(): Promise<void>;
    close(): Promise<void>;
    send(message: unknown): Promise<void>;
    onclose?: () => void;
    onerror?: (error: Error) => void;
    onmessage?: (message: unknown) => void;
  }
}
