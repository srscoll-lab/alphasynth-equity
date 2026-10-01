type Fetch = typeof fetch;

const METADATA_TOKEN_URL = "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token";
const METADATA_IDENTITY_URL = "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity";

export type GoogleCloudRuntimeOptions = {
  fetch?: Fetch;
  accessToken?: string;
};

export function googleCloudProjectId(environment: NodeJS.ProcessEnv = process.env): string {
  return String(
    environment.FUNDAMENTAL_REVIEW_GCP_PROJECT
      || environment.GOOGLE_CLOUD_PROJECT
      || environment.GCP_PROJECT_ID
      || "",
  ).trim();
}

export function createGoogleAccessTokenProvider(options: GoogleCloudRuntimeOptions = {}): () => Promise<string> {
  const fetchImpl = options.fetch ?? fetch;
  const configuredToken = options.accessToken?.trim();
  let cached: { value: string; expiresAt: number } | null = null;

  return async () => {
    if (configuredToken) return configuredToken;
    if (cached && cached.expiresAt > Date.now() + 60_000) return cached.value;
    const response = await fetchImpl(METADATA_TOKEN_URL, {
      headers: { "Metadata-Flavor": "Google" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Google metadata token request failed with HTTP ${response.status}.`);
    const payload = await response.json() as { access_token?: unknown; expires_in?: unknown };
    if (typeof payload.access_token !== "string" || !payload.access_token) {
      throw new Error("Google metadata token response did not contain an access token.");
    }
    const expiresIn = Number(payload.expires_in);
    cached = {
      value: payload.access_token,
      expiresAt: Date.now() + (Number.isFinite(expiresIn) ? expiresIn * 1000 : 300_000),
    };
    return cached.value;
  };
}

export function createGoogleIdentityTokenProvider(options: Pick<GoogleCloudRuntimeOptions, "fetch"> = {}) {
  const fetchImpl = options.fetch ?? fetch;
  const cache = new Map<string, { value: string; expiresAt: number }>();
  return async (audience: string): Promise<string> => {
    const normalizedAudience = String(audience || "").trim();
    if (!/^https:\/\//.test(normalizedAudience)) throw new Error("A valid HTTPS identity-token audience is required.");
    const cached = cache.get(normalizedAudience);
    if (cached && cached.expiresAt > Date.now() + 60_000) return cached.value;
    const response = await fetchImpl(`${METADATA_IDENTITY_URL}?audience=${encodeURIComponent(normalizedAudience)}&format=full`, {
      headers: { "Metadata-Flavor": "Google" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Google metadata identity-token request failed with HTTP ${response.status}.`);
    const value = (await response.text()).trim();
    if (!value) throw new Error("Google metadata identity-token response was empty.");
    cache.set(normalizedAudience, { value, expiresAt: Date.now() + 45 * 60_000 });
    return value;
  };
}
