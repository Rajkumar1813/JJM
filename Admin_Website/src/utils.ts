export function getErrorMessage(err: any, defaultMessage: string = 'An error occurred'): string {
  return err?.response?.data?.message || err?.message || defaultMessage;
}
