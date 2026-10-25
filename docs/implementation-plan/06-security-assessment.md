# 06 — Security assessment

## Changes implemented without storage migration

1. Pending unlock attempts are invalidated on lock, pagehide and disposal. Late key derivation cannot restore the teacher view after those events.
2. Inactivity checks compare wall and monotonic elapsed time before accepting interaction and on focus/visibility return, closing the delayed-timer gap. The first expired pointer/key event is intercepted.
3. Optional persistent-storage queries cannot prevent successful authentication or apply results to a later locked view.
4. Production HTML receives a restrictive CSP: same-origin scripts/connections/workers; no object embeds, base elements, frames, or form navigation. The bundled guide disallows scripts. Referrer policy is `no-referrer`.
5. Teacher-only code loads on selection; navigation remains a convenience boundary, not authorization.

Styles allow inline declarations because the existing scanner and responsive UI set element styles. Script `unsafe-inline` and `unsafe-eval` are not allowed. Data/blob images and blob media support the existing scanner/download ecosystem. Development HTML does not receive the production CSP, preserving Vite HMR; production validation runs with the policy enforced.

Meta policies cannot enforce `frame-ancestors`. On a host with configurable response headers, add a reviewed `Content-Security-Policy` header with `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, and an appropriate Permissions Policy. GitHub Pages has header limitations. See [MDN CSP reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy).

## Retained controls

PBKDF2-HMAC-SHA256 / 100,000 iterations, random salt, separate non-extractable AES/HMAC keys, AES-GCM fresh IV and record AAD, encrypted private IndexedDB payloads, atomic writes/audit, stale-input guards, validated replacement restore, spreadsheet text/formula guards, React text escaping, bundled runtime assets and active-session update checks remain intact. No `dangerouslySetInnerHTML`, application `eval`, third-party analytics or key persistence was introduced.

## Dependency findings and blocker

Installed Vite is 6.3.6. Maintainer advisories confirm this version is in affected ranges for development-server issues, including [GHSA-p9ff-h696-f583](https://github.com/vitejs/vite/security/advisories/GHSA-p9ff-h696-f583) (WebSocket file read; fixed in the 6.x line at 6.4.2) and [GHSA-fx2h-pf6j-xcff](https://github.com/vitejs/vite/security/advisories/GHSA-fx2h-pf6j-xcff) (Windows path bypass; fixed at 6.4.3). A subsequent 6.4.4 regression is fixed at 6.4.5: [GHSA-8g5g-mxqh-grgj](https://github.com/vitejs/vite/security/advisories/GHSA-8g5g-mxqh-grgj).

These advisories concern the development server under their documented exposure conditions, not proof of a vulnerability in the generated static site. Existing scripts bind development/preview to `127.0.0.1`; do not expose the development server to a classroom network.

An attempted registry lookup with `npm.cmd view vite@6 version --fetch-retries=0 --fetch-timeout=10000 --cache .npm-cache` failed with `EACCES` to `registry.npmjs.org`. pnpm is unavailable locally. The dependency and lockfile are intentionally left consistent rather than claiming an uninstalled/unverified upgrade. Before release, use a registry-enabled environment to upgrade to a patched compatible Vite version (evaluate 6.4.5 or newer against current advisories), regenerate the lockfile, run full install/build/test/browser checks and perform a complete dependency audit. This session does not certify the dependency graph free of vulnerabilities.

## Remaining trust limitations

Numeric PINs can be guessed offline; browser JavaScript cannot guarantee forensic memory erasure. QR codes/challenges are unsigned and relayable. Local audit is not independent evidence against device-owner tampering. Same-origin malicious scripts can access unlocked data. Clearing storage loses local records. Institution-specific privacy and retention policies remain external. No cryptographic upgrade, centralized authentication or compliance certification is claimed.
