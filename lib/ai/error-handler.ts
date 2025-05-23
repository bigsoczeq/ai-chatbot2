export function vercelSDKErrorHandler(error: unknown): string {
  if (error == null) {
    console.error('[Vercel SDK ErrorHandler] Null or undefined error received.');
    return 'An unknown error occurred within the AI SDK stream.';
  }

  // Log the full error server-side for more details, regardless of type
  console.error('[Vercel SDK ErrorHandler] Error caught:', error);

  if (typeof error === 'string') {
    return error;
  }

  if (error instanceof Error) {
    return error.message;
  }

  try {
    const stringifiedError = JSON.stringify(error);
    return stringifiedError;
  } catch (stringifyError) {
    console.error('[Vercel SDK ErrorHandler] Failed to stringify error:', stringifyError);
    return 'A non-serializable error occurred.';
  }
} 