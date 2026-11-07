# Self-hosting Open-Meteo on a VPS

Notes for later. **You don't need this for the hackathon:** the app uses the public API. Self-host only if you want to avoid a paid plan after launch. Nothing here has been tried yet.

Facts come from the Open-Meteo repo docs (`docs/getting-started.md`, `docs/sync-command.md`, `docs/downloading-datasets.md`) and the `open-data` README, read on 2026-11-07. Anything marked **Check** wasn't confirmed there.

## Decide first

| Option | Cost | Work | Good for |
|---|---|---|---|
| Public API (now) | Free | None | Hackathon, prototype |
| Paid API | Monthly fee, price not shown on the pricing page | Two env vars | First launch |
| Self-hosted | A bigger VPS | Install, disk, updates, monitoring | Steady commercial use |

Open-Meteo's own docs warn that they "do not support small deployments" and that a self-hosted instance is "generally slower" than the public API. They say it pays off mostly with many repeated calls. CropCash makes at most 336 calls a day because the API caches each county for 3 hours, so a paid plan is likely the cheaper choice at first.

## Licence

- **Code:** AGPL-3.0 or later. If you change the code and run it as a service, you must publish those changes. Running it unmodified is the simple case. Read the `LICENSE` file before launch.
- **Data:** CC BY 4.0. Self-hosting doesn't remove attribution, so the credit link in `WeatherCard` stays.
- **Commercial use, Check:** the getting-started page says self-hosting is "available for non-commercial and commercial use", while the README says to contact them for commercial use of "Open-Meteo APIs". Get this confirmed in writing before launch.

## VPS requirements

- **RAM:** 8 GB minimum, 16 GB recommended.
- **Disk:** at least 100 GB. NVMe is recommended because storage also acts as the cache.
- **CPU:** x86-64 or Arm, "relatively modern" with SIMD such as AVX2. **Check** whether a VPS without AVX2 can run it: `grep -c avx2 /proc/cpuinfo`.
- **OS:** the APT package supports **Ubuntu 22.04 only**. Check what the RareCloud VPS runs before choosing.

The current API VPS may be too small. Compare it with this list first. A separate VPS is cleaner if it is, and it also keeps a heavy weather server away from the money API.

## Install without Docker (Ubuntu 22.04)

```bash
sudo gpg --keyserver hkps://keys.openpgp.org --no-default-keyring \
  --keyring /usr/share/keyrings/openmeteo-archive-keyring.gpg --recv-keys E6D9BD390F8226AE
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/openmeteo-archive-keyring.gpg] https://apt.open-meteo.com $(lsb_release -cs) main" \
  | sudo tee /etc/apt/sources.list.d/openmeteo-api.list
sudo apt update
sudo apt install openmeteo-api
```

Edit `/etc/default/openmeteo-api.env` and uncomment these two lines. The server then reads weather data from Open-Meteo's public S3 bucket and checks for updates about every two minutes. This is the simplest setup, because you don't run a download job.

```bash
REMOTE_DATA_DIRECTORY=https://openmeteo.s3.amazonaws.com/data/
CACHE_SIZE=8GB
```

```bash
sudo systemctl restart openmeteo-api
sudo systemctl status openmeteo-api
sudo journalctl -u openmeteo-api.service
```

It listens on `127.0.0.1:8080`. Leave it there, so it isn't reachable from the internet.

## Test the exact request the app sends

```bash
curl "http://127.0.0.1:8080/v1/forecast?latitude=43.98&longitude=25.33&daily=temperature_2m_min,temperature_2m_max,precipitation_sum,precipitation_probability_max,wind_speed_10m_max&timezone=Europe%2FBucharest&forecast_days=7"
```

**Check** these in the response, because the docs didn't settle them:

- **Model:** the app doesn't choose one, so the server picks. ICON-EU (`dwd_icon_eu`) covers Europe but only 5 days, so 7 days needs a global model too, such as `ecmwf_ifs025` (15 days).
- **Rain chance:** `precipitation_probability_max` may come back empty, because it may rely on ensemble data. If it's `null`, the card shows "–" in the rain column.
- **Coverage:** confirm that the values for Romania are real numbers and not `null`.

## Connect CropCash

In the API `.env` on the VPS, then restart with pm2:

```bash
OPEN_METEO_BASE_URL=http://127.0.0.1:8080
OPEN_METEO_API_KEY=
```

No code changes are needed.

If it runs on a **separate VPS**, don't expose it openly. Put it behind Caddy with HTTPS and allow only the API server's IP address. The Open-Meteo docs show nginx, but this project already uses Caddy.

## Keep it healthy

- **Disk:** the docs suggest cron cleanup for old chunks if you store data locally:

  ```cron
  0 * * * * find /var/lib/openmeteo-api/data/ -type f -name "chunk_*" -wholename "*hPa*" -mtime +10 -delete
  5 * * * * find /var/lib/openmeteo-api/data/ -type f -name "chunk_*" -mtime +90 -delete
  ```

- **Local copy instead of S3 reads:** set `SYNC_ENABLED=true`, `SYNC_DOMAINS`, `SYNC_VARIABLES`, `SYNC_PAST_DAYS` and `SYNC_REPEAT_INTERVAL` in the same env file, then run `sudo systemctl restart openmeteo-sync`. Use `--bounding-box` with the manual `sync` command to limit it to Romania. Only do this if S3 reads are too slow.
- **Updates:** run `sudo apt update && sudo apt upgrade openmeteo-api` on a schedule.
- **Failures:** CropCash keeps serving its last copy of a county if the server goes down, and logs `[weather]`. Add a check on `journalctl` or a simple uptime ping.

## Going back

Clear `OPEN_METEO_BASE_URL` and restart. The API returns to the public service.
