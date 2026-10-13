const AUTH_URL = "https://api.intra.42.fr/oauth/authorize";
const TOKEN_URL = "https://api.intra.42.fr/oauth/token";
const ME_URL = "https://api.intra.42.fr/v2/me";

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
};

export function get42Config() {
  const strip = (v: string) =>
    v.trim().replace(/^["']|["']$/g, "");
  const clientId = strip(process.env.FORTY_TWO_UID ?? "");
  const clientSecret = strip(process.env.FORTY_TWO_SECRET ?? "").replace(
    /\s+/g,
    ""
  );
  const redirectUri = strip(
    process.env.FORTY_TWO_REDIRECT ??
      "http://localhost:3000/api/auth/42/callback"
  ).replace(/\/$/, "");
  return { clientId, clientSecret, redirectUri };
}

export function fortyTwoAuthorizeUrl(state: string): string {
  const { clientId, redirectUri } = get42Config();
  const p = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "public",
    state,
  });
  return `${AUTH_URL}?${p.toString()}`;
}

export async function exchange42Code(code: string): Promise<string> {
  const { clientId, clientSecret, redirectUri } = get42Config();
  if (!clientId || !clientSecret) {
    throw new Error("42 env missing (FORTY_TWO_UID/SECRET)");
  }
  let res: Response;
  try {
    res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        ...BROWSER_HEADERS,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
      cache: "no-store",
    });
  } catch (e) {
    throw new Error(
      `42 token fetch failed: ${(e as Error)?.message ?? e}`
    );
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `42 token exchange failed: ${res.status} ${body.slice(0, 300)} | redirect=${redirectUri} | uid=${clientId.slice(0, 12)}…`
    );
  }
  const data = (await res.json()) as { access_token: string };
  if (!data.access_token) throw new Error("42 token missing access_token");
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
  staff?: boolean;
  active?: boolean;
  alumni?: boolean;
  kind?: string;
  pool_month?: string | null;
  pool_year?: string | null;
  cursus_users?: {
    grade: string | null;
    end_at: string | null;
    cursus: { id: number; slug: string };
  }[];
};

// 42 Cursus id is 21, slug "42cursus". Pisciners only have the Piscine
// cursus (id 9). With `public` scope /v2/me includes cursus_users.
export function isEnrolledStudent(me: FortyTwoMe): boolean {
  if (me.staff) return false;
  if (me.active === false) return false;
  const cursus = me.cursus_users;
  // Fail open if API stops returning the field — don't lock out everyone.
  if (!Array.isArray(cursus)) return true;
  return cursus.some(
    (c) => c?.cursus?.id === 21 || c?.cursus?.slug === "42cursus"
  );
}

export async function fetch42Me(accessToken: string): Promise<FortyTwoMe> {
  const res = await fetch(ME_URL, {
    headers: { Authorization: `Bearer ${accessToken}`, ...BROWSER_HEADERS },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`42 /v2/me failed: ${res.status}`);
  return (await res.json()) as FortyTwoMe;
}
