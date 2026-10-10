export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public field?: string,
    public headers?: Record<string, string>,
  ) {
    super(message);
  }
}
