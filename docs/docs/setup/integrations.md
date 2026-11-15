---
id: integrations
---

# Integrations

## ClamAV

ClamAV is used to scan shares for malicious files and remove them if found.

Please note that ClamAV needs a lot of [resources](https://docs.clamav.net/manual/Installing/Docker.html#memory-ram-requirements).

### Docker

If you are already running ClamAV elsewhere, you can specify the `CLAMAV_HOST` environment variable to point to that instance.

Else you have to add the ClamAV container to the Pingvin Share X Docker Compose stack:

1. Add the ClamAV container to the Docker Compose stack and start the container.

```diff
services:
  pingvin-share-x:
    image: smp46/pingvin-share-x
    ...
+   depends_on:
+     clamav:
+       condition: service_healthy

+  clamav:
+    restart: unless-stopped
+    image: clamav/clamav

```

2. Docker will wait for ClamAV to start before starting Pingvin Share X. This may take a minute or two.
3. The Pingvin Share logs should now log "ClamAV is active"

### Stand-Alone

1. Install ClamAV
2. Specify the `CLAMAV_HOST` environment variable for the backend and restart the Pingvin Share X backend.

## Webhooks

Pingvin Share X can notify a webhook when a share is created or downloaded. Enable it in **Admin → Configuration → Integrations**.

- **Discord** (`https://discord.com/api/webhooks/...`) and **Slack** (`https://hooks.slack.com/...`) incoming webhook URLs are detected automatically and receive a plain text message.
- Any other URL receives a JSON payload. If a secret is configured, the body is signed with HMAC-SHA256 and the signature is sent in the `X-Pingvin-Signature` header (`sha256=<hex>`).
- Download notifications are sent at most once per minute and share. Only real downloads count, not inline views or range requests.
- A failing webhook never affects uploads or downloads, it is only logged.

Example payload:

```json
{
  "event": "share.created",
  "timestamp": "2026-11-13T19:44:32.000Z",
  "instance": "https://share.example.com",
  "text": "New share \"Holiday photos\" (3 files): https://share.example.com/share/aB3dE5gH",
  "data": {
    "share": {
      "id": "aB3dE5gH",
      "name": "Holiday photos",
      "url": "https://share.example.com/share/aB3dE5gH",
      "createdBy": "alice",
      "fileCount": 3,
      "size": 4821734,
      "expiration": "2026-11-20T19:44:32.000Z"
    }
  }
}
```

Verifying the signature in a shell:

```bash
printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET"
```

## Prometheus metrics

Pingvin Share X can expose aggregated metrics in the Prometheus format at `/api/metrics`. Enable it and set a **metrics token** in **Admin → Configuration → Integrations**. The endpoint stays disabled (`404`) while no token is set.

```yaml
scrape_configs:
  - job_name: pingvin-share-x
    metrics_path: /api/metrics
    authorization:
      credentials: "<metrics token>"
    static_configs:
      - targets: ["share.example.com"]
```

| Metric                                                    | Description                                   |
| --------------------------------------------------------- | --------------------------------------------- |
| `pingvin_users`                                           | Registered users                              |
| `pingvin_shares_active` / `pingvin_shares_expired`        | Active shares / expired shares not yet removed |
| `pingvin_files_active`, `pingvin_storage_bytes`           | Files and their total size in active shares   |
| `pingvin_reverse_shares_active`, `pingvin_api_tokens`     | Active reverse shares, API tokens             |
| `pingvin_share_views_total`                               | Total share views                             |
| `pingvin_build_info{version}`                             | Running version                               |
| `process_uptime_seconds`, `process_resident_memory_bytes` | Process information                           |

Only aggregated numbers are exposed, never anything about individual shares or users.

