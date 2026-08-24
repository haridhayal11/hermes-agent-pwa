import { hermes, type HermesModelProvider } from "@/lib/hermes";

// Zero-argument GET: without this Next prerenders it at build time and serves
// the build-time snapshot forever (this shipped as a bug once, on /api/skills).
export const dynamic = "force-dynamic";

/**
 * Hermes' /api/model/options enriches with provider catalogues and live
 * pricing, which makes it slow enough that opening the picker on it every
 * time is noticeable on a phone. Memoise for ten minutes; ?refresh=1 forwards
 * through and replaces the cache.
 */
const TTL_MS = 10 * 60_000;

interface CachedPayload {
  at: number;
  body: ModelsPayload;
}

// Pinned to globalThis for the same reason the db handle is: HMR reloads this
// module on every edit and would otherwise drop the cache each time.
const globalForModels = globalThis as unknown as { __hermesPwaModels?: CachedPayload };

export interface ModelChoice {
  id: string;
  fast: boolean;
  reasoning: boolean;
  featured: boolean;
}

export interface ModelProviderView {
  slug: string;
  name: string;
  authenticated: boolean;
  /** why it can't be used yet — Hermes writes this copy, we don't */
  warning: string | null;
  isCurrent: boolean;
  models: ModelChoice[];
}

export interface ModelsPayload {
  providers: ModelProviderView[];
  /**
   * What the gateway actually runs when we send no model at all.
   *
   * This is the only place it can be read. /v1/capabilities reports
   * `model: "hermes-agent"` and /v1/models lists the same string — that is the
   * virtual OpenAI-compatible alias, not a model anyone selected, and showing
   * it to a user is showing them nothing. /api/model/options carries the
   * resolved pair at the top level.
   */
  current: { model: string | null; provider: string | null };
  /** true when Hermes couldn't be reached — the picker says so rather than showing nothing */
  unavailable?: boolean;
}

function flatten(providers: HermesModelProvider[]): ModelProviderView[] {
  return providers
    .map((p) => {
      const featured = new Set(p.featured_models ?? []);
      return {
        slug: p.slug,
        name: p.name || p.slug,
        authenticated: p.authenticated !== false,
        warning: typeof p.warning === "string" && p.warning ? p.warning : null,
        isCurrent: p.is_current === true,
        models: (p.models ?? []).map((id) => {
          const caps = p.capabilities?.[id] ?? {};
          return {
            id,
            fast: caps.fast === true,
            reasoning: caps.reasoning === true,
            featured: featured.has(id),
          };
        }),
      };
    })
    // A provider with no models is a "paste your API key" row, not a choice.
    // Keep the authenticated empty ones out; they'd be dead weight in a sheet.
    .filter((p) => p.models.length > 0)
    .sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent) || a.name.localeCompare(b.name));
}

export async function GET(req: Request) {
  const refresh = new URL(req.url).searchParams.get("refresh") === "1";
  const cached = globalForModels.__hermesPwaModels;
  if (!refresh && cached && Date.now() - cached.at < TTL_MS) {
    return Response.json(cached.body);
  }

  try {
    const res = await hermes.modelOptions(refresh);
    const body: ModelsPayload = {
      providers: flatten(res.providers ?? []),
      current: {
        model: typeof res.model === "string" ? res.model : null,
        provider: typeof res.provider === "string" ? res.provider : null,
      },
    };
    globalForModels.__hermesPwaModels = { at: Date.now(), body };
    return Response.json(body);
  } catch {
    // Serve a stale cache over an error: a model list from ten minutes ago is
    // still true, and the alternative is an empty picker.
    if (cached) return Response.json(cached.body);
    return Response.json({
      providers: [],
      current: { model: null, provider: null },
      unavailable: true,
    } satisfies ModelsPayload);
  }
}
