// Running totals of what the server has sent this page, counted as frames
// arrive on the socket, so the bytes are the compressed size on the wire.
export const wireStats = { messages: 0, bytes: 0 };

// The SDK opens its own WebSocket and doesn't expose the adapter it wraps
// around it, so count by swapping in a WebSocket that listens to its own
// messages. Call this before building the connection.
export function countWebSocketBytes(): void {
  const NativeWebSocket = globalThis.WebSocket;
  globalThis.WebSocket = class extends NativeWebSocket {
    constructor(url: string | URL, protocols?: string | string[]) {
      super(url, protocols);
      this.addEventListener("message", (event: MessageEvent) => {
        wireStats.messages += 1;
        wireStats.bytes += byteLength(event.data);
      });
    }
  };
}

function byteLength(data: unknown): number {
  if (data instanceof ArrayBuffer) return data.byteLength;
  if (data instanceof Blob) return data.size;
  return new TextEncoder().encode(String(data)).length;
}
