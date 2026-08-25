# Path native session creation requirement

Studio Go web requests rely on the browser-supplied `Origin` header and Path's
exact-origin CORS allowlist. React Native Android and iOS requests do not have a
trustworthy browser origin, so the client must not forge one and Path must not
use wildcard CORS or accept every Origin-less POST.

Before native session creation is enabled, Path needs a server-verifiable native
authorization capability for `POST /api/sessions`. The smallest acceptable
contract is:

1. Studio Go obtains a short-lived, audience-bound credential from an approved
   identity or app-attestation provider.
2. Studio Go sends it in `Authorization: Bearer <credential>`.
3. Path verifies signature, issuer, audience, expiry, and replay protection on
   the server before accepting an Origin-less native POST.
4. Path keeps the existing exact-origin browser CORS checks unchanged.
5. Invalid, missing, expired, or replayed credentials return a normalized 401 or
   403 response without starting a workflow.

No long-lived secret may be stored in Expo public configuration or client code.
`EXPO_PUBLIC_PATH_API_URL` contains only the public Path origin.
