# HTTPS deployment

## GitHub Pages

The repository includes `.github/workflows/ci.yml` for automated tests/builds and `.github/workflows/pages.yml` for manually dispatched publication. Creating a workflow does not enable Pages or confirm a deployment.

1. In the repository Settings / Pages, select GitHub Actions as the build and deployment source. Confirm the repository plan and visibility permit Pages.
2. Open Actions / Publish attendance website. Choose the intended branch and run the workflow.
3. Inspect the successful deployment job and use its returned HTTPS URL. Do not infer a live URL from the repository name alone.
4. Test the deployed path, icon, manifest, worker scope, CSV import, backup download, cold offline reopening and decoder fallback on real devices.

The workflow obtains the configured Pages base path. Vite builds with `BASE_PATH`; all website assets and offline resource checks use the same base. Root-host builds use `/`. Repository paths such as `/ClassAttendance/` are supported.

Publication uses manual dispatch to keep source pushes separate from a public release decision. There is no server-side student database in this build. Publishing the source does not publish a teacher's browser records, but source code and synthetic fixtures become available under the repository's access rules.

## Other static HTTPS hosts

Run `pnpm build` and publish `dist` at a stable HTTPS origin. Set `BASE_PATH` for subdirectory hosting. Serve JavaScript and the worker with correct MIME types. Avoid long immutable caching of `index.html` and `sw.js`; hashed assets may be cached aggressively. Configure your host to restrict framing and unnecessary permissions. Camera permission must remain available to the intended origin.

Review and test a Content Security Policy appropriate to the selected host, bundled decoder and service worker. Do not add arbitrary external scripts or weaken certificate validation. GitHub Pages does not provide arbitrary custom response-header configuration, so document any hosting limitations in the institutional deployment assessment.

## Origin and update policy

Changing origin or browser profile does not move local records. Export and validate backups before migration. The website prompts for updates rather than forcing them into an active attendance session. Close the session before applying an update. Do not substitute `autoUpdate` for that policy.

Browser origin, not URL path, is the security boundary. Other projects on the same GitHub Pages origin can share browser storage access. A dedicated institutional origin avoids accidental sharing with unrelated projects, but still requires reviewed code and hosting controls.

## Release gate

- CI passes and the actual deployed URL loads over HTTPS.
- Worker scope and offline assets match the final base path.
- Teacher recovery succeeds on a second supported physical device.
- Browser and field matrices contain actual results, not assumed support.
- The institution approves privacy, device handling and retention procedures.

References: [GitHub Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages), [Vite static deployment](https://vite.dev/guide/static-deploy.html).
