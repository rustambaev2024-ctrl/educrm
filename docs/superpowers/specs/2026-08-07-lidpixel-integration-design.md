# LidPixel API-key integration — design

Date: 2026-08-07

## Context

Client wants to integrate EduCRM with the "LidPixel" lead platform, the same way
amoCRM/Bitrix24 integrations work: LidPixel pushes lead data into our CRM via an
inbound webhook authenticated with a per-institution API key.

LidPixel's exact request format (field names, where the key goes) is unknown — no
public docs found. The design below targets a generic, easily-adjustable contract
that can be tweaked once we see a real request in logs or the client shares docs.

An existing endpoint, `public_submit_lead`, accepts unauthenticated lead submissions
and resolves the tenant purely from an `X-Tenant-Schema` header (no secret check).
That pattern is intentionally **not** reused here — it's fine for a same-origin
landing-page form, but wrong for a third-party server-to-server integration. This
feature is scoped to a new, separately-secured endpoint; the existing endpoint is
left untouched.

## Data model

`Institution` (backend/apps/tenants/models.py) gains:

- `lead_api_key` — `CharField(max_length=64, blank=True, default="", unique=True... )`
  via a partial constraint (empty string allowed for institutions that never
  generated one; DB-level uniqueness only enforced for non-empty values).

Key is generated on first request via `secrets.token_urlsafe(32)`, stored as-is
(not hashed) — same trust level as `meta_access_token`/`sms_password`, which are
already stored in plaintext on this model. Regenerating overwrites the field,
instantly invalidating the old key (no grace period — acceptable per approved
design; single active key at a time).

## Backend

### Endpoint

`POST /api/v1/public/leads/lidpixel/` — new view, `AllowAny` + throttled by key.

Added to `HeaderOrDomainTenantMiddleware.PUBLIC_PATH_PREFIXES` so the middleware
does not require/resolve `X-Tenant-Schema` for this path; `request.tenant` stays
`None` and the view resolves the tenant itself, from the key alone.

Auth: key read from `X-Api-Key` header, falling back to `?key=` query param (some
external lead platforms can't set custom headers on outgoing webhooks).

Flow:
1. Look up `Institution.objects.get(lead_api_key=key)` (schema is public at this
   point, matching how the tenant model is always queried). Missing/invalid key →
   `401 {"detail": "Invalid API key"}`.
2. Parse body — accept field aliases since the real LidPixel payload shape is
   unknown: `name`/`full_name`, `phone`/`telephone`/`phone_number`, `email`
   (stored in `notes` since `StudentLead` has no email field), free-form `notes`.
   Missing name or phone → `400`.
3. `with schema_context(institution.schema_name):` create `StudentLead` with
   `source="lidpixel"` and `branch=Branch.objects.first()` (same fallback
   `public_submit_lead` uses today).
4. Log the raw request body at INFO level (`logger.info("lidpixel lead payload: %s", ...)`)
   so the real field layout can be confirmed/adjusted once the client turns the
   integration on, without needing to guess blind.
5. Respond `201 {"id": ..., "status": "ok"}`.

Throttle: custom `AnonRateThrottle` subclass scoped by the resolved key rather than
by IP (a webhook has one caller IP but we don't want one leaked key hammering us,
and IP throttling doesn't fit a server-to-server caller). `60/hour` per key —
generous for lead volume, tight enough to blunt key-guessing/abuse.

`source="lidpixel"` added to `StudentLead`'s valid source choices (wherever that's
enforced — mirrors `valid_sources` set in `public_submit_lead`).

### Settings management

New `BranchViewSet` action `lead-api-key` (GET/POST), `IsDirector`-gated, mirroring
the existing `meta-settings`/`sms-settings` actions:
- `GET` → returns the current key masked (`"****" + last 4 chars`) or empty if
  none generated yet, plus the full webhook URL to show in the UI.
- `POST` → generates (or regenerates) the key, returns it **unmasked once** (same
  UX convention as e.g. GitHub PATs — the plaintext is only shown right after
  creation/regeneration, subsequent GETs are masked).

## Frontend

`src/routes/director/integrations.tsx` gets a third section, "LidPixel", next to
Meta Pixel and SMS, following the same fetch-on-mount / save pattern:
- Shows the webhook URL (read-only, copy button) and the masked key.
- "Generate" / "Regenerate" button — on click, calls the POST action, shows the
  returned plaintext key once in a copyable field with a warning that it won't be
  shown again, and a confirm step before regenerating an existing key (since it
  immediately breaks the client's existing LidPixel setup).

`branchApi` gains `leadApiKey.get()` / `leadApiKey.generate()`.

## Testing

- Valid key + valid payload → 201, `StudentLead` created in the correct tenant
  schema with `source="lidpixel"`.
- Missing/wrong key → 401, no lead created, no tenant/institution info leaked in
  the response.
- Valid key, missing phone → 400.
- Field aliases (`name` vs `full_name`, `telephone` vs `phone`) both map correctly.
- Regenerating a key invalidates the old one (old key → 401 after regenerate).
- Throttle: N+1th request within the window with the same key → 429.

## Out of scope (explicitly not doing now)

- Not touching `public_submit_lead`'s existing insecure tenant-header resolution —
  flagged to the user as a related gap, left alone per current scope.
- Not building a generic multi-provider "integration keys" table (would support
  amoCRM/Bitrix/etc. with multiple named keys each). YAGNI for a single
  client-requested LidPixel key today; the `Institution.lead_api_key` field can be
  generalized later if a second integration shows up.
- No key hashing/HMAC-signature verification of the payload — matches the trust
  level already used for this model's other integration secrets.
