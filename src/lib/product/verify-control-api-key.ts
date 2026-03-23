/**
 * Same bearer scheme as POST /api/openclaw — AEGIS_API_KEY.
 */
export function verifyControlApiKey(request: Request): boolean {
  const apiKey = process.env.AEGIS_API_KEY;
  if (!apiKey) {
    return process.env.NODE_ENV === 'development';
  }
  const auth = request.headers.get('authorization') ?? '';
  const [, token] = auth.split(' ');
  return token === apiKey;
}
