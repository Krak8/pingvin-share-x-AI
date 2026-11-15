---
id: api-and-curl
---

# API tokens and curl

Pingvin Share X can be used from the command line, scripts, cron jobs and tools like ShareX. For this you create an **API token** and use it with `curl`.

## Creating an API token

1. Open **My account** and find the **API tokens** card.
2. Click **Create token**, give it a name, choose the permissions and an expiration.
3. Copy the token right away. It starts with `pvx_` and is **only shown once**; the server only stores a hash of it.

| Permission | Allows                                                    |
| ---------- | --------------------------------------------------------- |
| `upload`   | Creating shares and uploading files                       |
| `read`     | Listing your shares and downloading files                 |
| `manage`   | Editing, expiring and deleting shares                     |

Tokens are deliberately limited. They only work for shares and uploads, never for your account, other API tokens, or any admin endpoint, and a token never has administrator rights, even if it belongs to an administrator. Revoke a token in the same card to cut off access immediately.

Administrators can disable API tokens and limit how many each user can have in **Admin → Configuration → Security**.

All examples below use these variables:

```bash
export URL="https://share.example.com"
export TOKEN="pvx_..."
```

## Uploading

Every upload creates a share and returns its link. The same limits as in the web interface apply (share size, expiration, storage quota, virus scan, ...).

### Multipart upload

```bash
curl -H "Authorization: Bearer $TOKEN" -F "file=@report.zip" "$URL/api/upload"
```

The response is JSON:

```json
{
  "id": "aB3dE5gH",
  "url": "https://share.example.com/share/aB3dE5gH",
  "directUrl": "https://share.example.com/api/d/aB3dE5gH/report.zip",
  "expiresAt": "2026-11-21T10:00:00.000Z",
  "passwordProtected": false,
  "oneTimeDownload": false,
  "files": [{ "id": "…", "name": "report.zip", "size": 300000, "url": "…" }]
}
```

Repeat `-F file=@...` to put several files into one share (up to 100). For scripts, `?format=text` returns just the share link and `?format=direct` the direct link of a single-file share:

```bash
LINK=$(curl -s -H "Authorization: Bearer $TOKEN" -F "file=@report.zip" "$URL/api/upload?format=text")
```

### Upload with PUT

```bash
curl -H "Authorization: Bearer $TOKEN" -T backup.tar.gz "$URL/api/upload/backup.tar.gz?expires=2w&format=text"
```

The file name is the last part of the path. Folder structures are never kept, only the file name is used.

### Options

Options are form fields for the multipart upload (`-F expires=7d`) and query parameters for the PUT upload (`?expires=7d`).

| Option        | Description                                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------------------------- |
| `expires`     | `30min`, `12h`, `7d`, `2w`, `3mo`, `1y` or `never`. The long form `7-days` works too. Defaults to the server default. |
| `password`    | Protects the share (3-30 characters). For PUT uploads prefer the `X-Share-Password` header over the URL.          |
| `maxViews`    | Maximum number of visitors.                                                                                         |
| `name`        | Name of the share (3-30 characters).                                                                                |
| `description` | Description of the share (up to 512 characters).                                                                    |
| `id`          | Custom share ID (3-50 characters of `a-z A-Z 0-9 _ -`).                                                             |
| `oneTime`     | `true` deletes the share after its first download, see [one-time downloads](#one-time-downloads).                 |
| `noEmbed`     | `true` disables link previews for this share, see [link previews](#link-previews-discord-slack-).                  |

### Reverse share links

Reverse share links can be used without an account by sending the token of the link in a header. Its expiration, size limit and remaining uses apply.

```bash
curl -H "X-Reverse-Share-Token: $REVERSE_SHARE_TOKEN" -F "file=@photo.jpg" "$URL/api/upload"
```

## Downloading

Every file has a stable **direct URL** that serves the raw file without any page in between:

```
https://share.example.com/api/d/<shareId>/<fileName>
```

```bash
# Saves the file under its original name
curl -OJ "$URL/api/d/aB3dE5gH/report.zip"

# Shares with exactly one file also work without the file name
curl -OJ "$URL/api/d/aB3dE5gH"
```

- Images, video, audio and plain text are shown **inline** in the browser, everything else is downloaded. Append `?download=1` to force a download (or `?download=0` for inline).
- `Range` requests are supported, so video and audio can seek and downloads can be resumed with `curl -C -`.
- Responses carry an `ETag`, so repeated requests only transfer the file if it changed.
- Expiration, view limits, passwords and recipient restrictions are enforced just like on the share page.

In the web interface the **copy link** button of a file copies its direct URL.

### Password protected shares

Request a share token with the password, then send it in the `X-Share-Token` header:

```bash
SHARE_TOKEN=$(curl -s -X POST -H "Content-Type: application/json" \
  -d '{"password":"hunter22"}' "$URL/api/shares/aB3dE5gH/token" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')

curl -OJ -H "X-Share-Token: $SHARE_TOKEN" "$URL/api/d/aB3dE5gH/report.zip"
```

## Managing shares

```bash
# List your shares (needs "read")
curl -H "Authorization: Bearer $TOKEN" "$URL/api/shares"

# Expire a share immediately (needs "manage")
curl -X POST -H "Authorization: Bearer $TOKEN" "$URL/api/shares/aB3dE5gH/expire"

# Delete a share (needs "manage")
curl -X DELETE -H "Authorization: Bearer $TOKEN" "$URL/api/shares/aB3dE5gH"
```

A request with an invalid, expired or revoked token always fails with `401`. It is never treated as an anonymous request, so a typo can't create a share that belongs to nobody.

## One-time downloads

A share created with `oneTime` (or the **Delete after the first download** option in the web interface) is deleted as soon as it has been downloaded once.

- Only real downloads count. `HEAD` requests do not.
- Previews, inline requests and `Range` requests are refused, otherwise the file could be viewed as often as wanted. The direct URL downloads by default.
- If several people download at the same moment, exactly one of them gets the file.
- An interrupted download still counts, so one-time shares are best for links you hand to a single person.
- With S3 storage the files are removed a few minutes after the download, so that the already issued download URL keeps working.
- Don't paste the _direct URL_ of a one-time share into a chat app: the app's link preview bot would download it. The link to the share page is safe.

## Link previews (Discord, Slack, ...)

When the link of a share is posted in apps like Discord, Slack, Telegram or Mastodon, they show a preview:

- A single **image** is shown inline, **video** and **audio** link to the file.
- Everything else (documents, shares with several files) shows a card with the name, file count and size.

For privacy, a preview **never** shows anything about shares that have a password, a view limit, a one-time download or restricted recipients, or about expired and unknown shares. They get the same generic card, so a preview doesn't reveal more than the link itself. Previews don't count as visits.

Administrators can turn previews off in **Admin → Configuration → Share**, and a share can opt out with `noEmbed` / **Disable link previews**. Note that chat apps cache previews, so a changed or deleted share may keep showing the old preview for a while.

The preview data is added to the page for known preview bots only. If you use a reverse proxy, make sure it passes the `User-Agent` header and that `/api/` is routed to the backend (the bundled Caddy configuration already does this).

## Limits

- Uploads are limited to 60 requests per minute per IP address, creating API tokens to 10 per minute.
- Temporary files of interrupted uploads are cleaned up automatically.
- Files are written to the same storage as uploads from the web interface (local disk or S3).

## Example: a small shell helper

```bash
share() {
  curl -s -H "Authorization: Bearer $TOKEN" -F "file=@$1" "$URL/api/upload?format=text"
}

share screenshot.png   # prints the share link
```

For tools like ShareX or Flameshot's custom uploaders, use `POST $URL/api/upload` with the `Authorization` header, the file in the `file` form field and `?format=direct` to receive the direct link as plain text.
