#!/usr/bin/env python3
"""
update_tle.py
-------------
Fetches fresh, real Two-Line Element (TLE) sets from CelesTrak
(https://celestrak.org) for every category used by the Satellite
Tracker app, and writes them into data/tle/<category>.json in the
same schema the frontend (js/app.js) expects.

Meant to be run:
  1) locally, whenever you want fresh data:  python3 scripts/update_tle.py
  2) automatically on a schedule via GitHub Actions
     (see .github/workflows/update-tle.yml), which commits the
     refreshed JSON files back into the repository. Because this runs
     server-side (not in the browser), there are no CORS restrictions.

CelesTrak usage policy: please do not poll more than a few times a
day - elements are only regenerated a few times daily server-side.
https://celestrak.org/NORAD/elements/
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "tle")
BASE_URL = "https://celestrak.org/NORAD/elements/gp.php"
USER_AGENT = "satellite-tracker-demo/1.0 (+https://github.com/)"

# category key -> (display groups to merge, hard cap on satellite count
# to keep the map/browser performant for very large constellations)
CATEGORY_GROUPS = {
    "stations":        (["stations"], 60),
    "starlink":        (["starlink"], 120),
    "weather":         (["weather", "noaa", "earth-resources"], 80),
    "communications":  (["geo", "intelsat", "ses", "iridium-NEXT"], 100),
    "navigation":      (["gps-ops", "glo-ops", "galileo", "beidou"], 120),
    "debris":          (["cosmos-2251-debris", "iridium-33-debris", "fengyun-1c-debris"], 100),
    "other":           (["active"], 150),
}


def fetch_group_tle(group, retries=3, timeout=20):
    """Fetch a CelesTrak group in classic 3-line TLE format and return
    a list of {name, noradId, tle1, tle2} dicts."""
    url = f"{BASE_URL}?GROUP={group}&FORMAT=tle"
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    last_err = None
    for attempt in range(1, retries + 1):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                text = resp.read().decode("utf-8", errors="replace")
            return parse_3le(text)
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as e:
            last_err = e
            print(f"  [warn] {group}: attempt {attempt}/{retries} failed ({e}); retrying…", file=sys.stderr)
            time.sleep(2 * attempt)
    print(f"  [error] {group}: giving up after {retries} attempts ({last_err})", file=sys.stderr)
    return []


def parse_3le(text):
    lines = [l.rstrip("\r\n") for l in text.splitlines() if l.strip() != ""]
    sats = []
    i = 0
    while i + 2 < len(lines):
        name_line = lines[i]
        l1 = lines[i + 1]
        l2 = lines[i + 2]
        if not (l1.startswith("1 ") and l2.startswith("2 ")):
            i += 1
            continue
        try:
            norad_id = int(l1[2:7])
        except ValueError:
            i += 3
            continue
        sats.append({
            "name": name_line.strip(),
            "noradId": norad_id,
            "tle1": l1,
            "tle2": l2,
        })
        i += 3
    return sats


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    summary = []

    for key, (groups, cap) in CATEGORY_GROUPS.items():
        merged = {}
        for group in groups:
            print(f"Fetching group '{group}' for category '{key}'…")
            sats = fetch_group_tle(group)
            print(f"  -> {len(sats)} objects")
            for s in sats:
                merged.setdefault(s["noradId"], s)  # dedupe by NORAD id
            time.sleep(1)  # be polite to CelesTrak between requests

        sat_list = list(merged.values())[:cap]
        path = os.path.join(OUT_DIR, f"{key}.json")

        if not sat_list:
            print(f"  [warn] no data fetched for '{key}', keeping existing file untouched.")
            summary.append((key, "SKIPPED (fetch failed)", 0))
            continue

        with open(path, "w") as f:
            json.dump({
                "generated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "source": f"CelesTrak groups: {', '.join(groups)}",
                "satellites": sat_list,
            }, f, indent=2)
        summary.append((key, "OK", len(sat_list)))
        print(f"  wrote {len(sat_list)} satellites -> {path}\n")

    print("\n=== Summary ===")
    for key, status, count in summary:
        print(f"  {key:<16} {status:<24} {count} satellites")


if __name__ == "__main__":
    main()
