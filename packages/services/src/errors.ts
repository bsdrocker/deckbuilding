export type ServiceErrorCode = 'not_found' | 'forbidden' | 'conflict' | 'bad_request';

/** Domain error with a code the transport layer maps to an HTTP status. */
export class ServiceError extends Error {
  constructor(
    public readonly code: ServiceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}

export const HTTP_STATUS: Record<ServiceErrorCode, number> = {
  not_found: 404,
  forbidden: 403,
  conflict: 409,
  bad_request: 400,
};
