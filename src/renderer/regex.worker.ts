const scope = self as unknown as {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage: (value: unknown) => void;
};
scope.onmessage = (event) => {
  try {
    const { values, pattern, flags } = event.data;
    if (
      !Array.isArray(values) ||
      typeof pattern !== "string" ||
      pattern.length > 256 ||
      !["", "i"].includes(flags)
    )
      throw new Error("Invalid search pattern.");
    const regex = new RegExp(pattern, flags);
    scope.postMessage({
      matches: values.map((value: string) => regex.test(value)),
    });
  } catch (error) {
    scope.postMessage({
      error:
        error instanceof Error ? error.message : "Invalid regular expression.",
    });
  }
};
