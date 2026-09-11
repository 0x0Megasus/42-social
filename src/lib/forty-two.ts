const AUTH_URL = "https://api.intra.42.fr/oauth/authorize";
const TOKEN_URL = "https://api.intra.42.fr/oauth/token";
const ME_URL = "https://api.intra.42.fr/v2/me";

export function get42Config() {
  const clientId = process.env.FORTY_TWO_UID ?? "";
  const clientSecret = process.env.FORTY_TWO_SECRET ?? "";
  const redirectUri =
    process.env.FORTY_TWO_REDIRECT ??
    "http://localhost:3000/api/auth/42/callback";
  return { clientId, clientSecret, redirectUri };
}

export function fortyTwoAuthorizeUrl(state: string): string {
  const { clientId, redirectUri } = get42Config();
  const p = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "public profile",
    state,
  });
  return `${AUTH_URL}?${p.toString()}`;
}

export async function exchange42Code(code: string): Promise<string> {
  const { clientId, clientSecret, redirectUri } = get42Config();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`42 token exchange failed: ${res.status}`);
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

export type FortyTwoMe = {
  id: number;
  email: string;
  login: string;
  usual_full_name: string;
  displayname: string;
  image: { link: string | null };
  campus?: { name: string }[];
  coalitions?: { name: string; slug: string }[];
};

export async function fetch42Me(accessToken: string): Promise<FortyTwoMe> {
  const res = await fetch(ME_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`42 /v2/me failed: ${res.status}`);
  return (await res.json()) as FortyTwoMe;
}
