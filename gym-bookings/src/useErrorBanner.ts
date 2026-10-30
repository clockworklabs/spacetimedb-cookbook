import { useState } from "react";

// Reducer calls resolve once the server has run them, or reject with the
// reducer's error.
export function useErrorBanner() {
  const [error, setError] = useState<string | null>(null);

  const withErrorBanner = (promise: Promise<void>) => {
    setError(null);
    promise.catch((e: unknown) =>
      setError(e instanceof Error ? e.message : String(e)),
    );
  };

  return [error, withErrorBanner] as const;
}
