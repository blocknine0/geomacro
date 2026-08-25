type NotifyErrorResult = {
  message: string;
  error: unknown;
};

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string" && error.trim()) {
    return error;
  }

  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }

  return "Unknown error";
}

function success(title: string, message?: string): void {
  if (typeof window !== "undefined") {
    console.info(
      `[success] ${title}${message ? ` — ${message}` : ""}`
    );
  }
}

function error(
  scope: string,
  err: unknown,
  action?: string
): NotifyErrorResult {
  const raw = normalizeErrorMessage(err);

  const message = action
    ? `Failed while ${action}: ${raw}`
    : raw;

  console.error(`[${scope}] ${message}`, err);

  return {
    message,
    error: err,
  };
}

export const notify = {
  success,
  error,
};
