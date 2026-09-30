#!/usr/bin/env python3
"""
gen_seed_tle.py
---------------
Generates syntactically-valid, checksum-correct TLE (Two-Line Element)
"seed" data for the Satellite Tracker demo, so the app has something
realistic to render immediately after being cloned - without requiring
a live call to CelesTrak first.

Field widths/positions follow the official NORAD TLE spec and were
cross-checked against a real ISS TLE to guarantee byte-for-byte column
alignment (required for satellite.js's fixed-column parser).

These seed orbits are physically plausible (correct altitude <-> mean
motion relationship via Kepler's third law) for each satellite class,
but are NOT guaranteed to match any single real object's *current*
position. Real, live-updated TLEs are fetched by scripts/update_tle.py
(run manually or via the GitHub Actions workflow) and will overwrite
these seed files under data/tle/*.json.

Run:
    python3 scripts/gen_seed_tle.py
"""
import json
import math
import os
from datetime import datetime, timezone

MU = 398600.4418          # km^3/s^2, Earth's gravitational parameter
EARTH_R = 6378.137         # km, equatorial radius
SEC_PER_DAY = 86400.0

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "tle")


def mean_motion_for_altitude(alt_km):
    """Return mean motion in revolutions/day for a circular orbit at alt_km."""
    a = EARTH_R + alt_km
    period_s = 2 * math.pi * math.sqrt(a ** 3 / MU)
    return SEC_PER_DAY / period_s


def checksum(line68):
    """TLE checksum: sum of all digits mod 10; '-' counts as 1; other chars = 0."""
    total = 0
    for ch in line68:
        if ch.isdigit():
            total += int(ch)
        elif ch == "-":
            total += 1
    return total % 10


def fmt_exp(value):
    """Assumed-decimal-point exponential notation used for 2nd-deriv / BSTAR,
    e.g. 0.000059442 -> ' 59442-4' (8 chars)."""
    if value == 0:
        return " 00000-0"
    sign = "-" if value < 0 else " "
    value = abs(value)
    exp = 0
    while value >= 1:
        value /= 10.0
        exp += 1
    while value < 0.1:
        value *= 10.0
        exp -= 1
    mantissa = int(round(value * 1e5))
    if mantissa >= 100000:
        mantissa //= 10
        exp += 1
    exp_sign = "-" if exp <= 0 else "+"
    return f"{sign}{mantissa:05d}{exp_sign}{abs(exp)}"


def fmt_leading(value, decimals=8):
    """Leading-decimal-point notation for the 1st derivative of mean motion,
    e.g. 0.00003075 -> ' .00003075' (10 chars)."""
    sign = "-" if value < 0 else " "
    val = abs(value)
    s = f"{val:.{decimals}f}"
    digits = s.split(".")[1]
    return f"{sign}.{digits}"


def epoch_fields(dt):
    yy = dt.year % 100
    start_of_year = datetime(dt.year, 1, 1, tzinfo=timezone.utc)
    day_of_year = (dt - start_of_year).total_seconds() / SEC_PER_DAY + 1
    return yy, day_of_year


def make_tle(satnum, name, inclination, raan, ecc, argp, ma, alt_km,
             classification="U", intl_desig="26001A  ", epoch=None,
             mmdot=0.0, mmddot=0.0, bstar=0.0001, ephtype=0, elset=999,
             revnum=1234):
    if epoch is None:
        epoch = datetime.now(timezone.utc)
    yy, doy = epoch_fields(epoch)
    mm = mean_motion_for_altitude(alt_km)

    l1_68 = (
        "1 " + f"{satnum:05d}" + classification + " " +
        f"{intl_desig:<8}" + " " +
        f"{yy:02d}" + f"{doy:012.8f}" + " " +
        fmt_leading(mmdot) + " " +
        fmt_exp(mmddot) + " " +
        fmt_exp(bstar) + " " +
        f"{ephtype}" + " " +
        f"{elset:4d}"
    )
    l1 = l1_68 + str(checksum(l1_68))

    ecc_str = f"{round(ecc * 1e7):07d}"
    l2_68 = (
        "2 " + f"{satnum:05d}" + " " +
        f"{inclination:8.4f}" + " " +
        f"{raan:8.4f}" + " " +
        ecc_str + " " +
        f"{argp:8.4f}" + " " +
        f"{ma:8.4f}" + " " +
        f"{mm:11.8f}" +
        f"{revnum:5d}"
    )
    l2 = l2_68 + str(checksum(l2_68))

    assert len(l1) == 69, f"line1 wrong length: {len(l1)}\n{l1}"
    assert len(l2) == 69, f"line2 wrong length: {len(l2)}\n{l2}"

    return {"name": name, "noradId": satnum, "tle1": l1, "tle2": l2}


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    epoch = datetime.now(timezone.utc)

    datasets = {}

    # --- Stations & crew (~390-420 km, ~51.6 / ~41.5 deg incl) ---
    stations = [
        make_tle(25544, "ISS (ZARYA)", 51.64, 59.2, 0.0004, 90.0, 270.0, 418, epoch=epoch, revnum=40001),
        make_tle(48274, "CSS (TIANHE)", 41.47, 120.5, 0.0006, 45.0, 315.0, 390, epoch=epoch, revnum=20002),
    ]
    datasets["stations"] = stations

    # --- Starlink (~550 km, ~53 deg incl), spread across RAAN/MA ---
    starlink = []
    base_id = 44713
    for i in range(10):
        starlink.append(make_tle(
            base_id + i, f"STARLINK-{1007 + i}", 53.05,
            (i * 36) % 360, 0.0001, (i * 17) % 360, (i * 41) % 360,
            550, epoch=epoch, revnum=9000 + i))
    datasets["starlink"] = starlink

    # --- Weather & Earth observation ---
    weather = [
        make_tle(33591, "NOAA 19", 99.19, 122.5, 0.0014, 271.8, 88.2, 850, epoch=epoch, revnum=61000),
        make_tle(43689, "NOAA 20 (JPSS-1)", 98.71, 95.0, 0.0001, 100.0, 260.0, 825, epoch=epoch, revnum=11000),
        make_tle(41866, "GOES 16", 0.05, 267.0, 0.0001, 60.0, 300.0, 35786, epoch=epoch, revnum=5000),
        make_tle(29155, "METOP-A", 98.7, 15.0, 0.0009, 50.0, 310.0, 817, epoch=epoch, revnum=80000),
    ]
    datasets["weather"] = weather

    # --- Communications (mostly GEO) ---
    comm = [
        make_tle(28884, "INTELSAT 10-02", 0.03, 342.0, 0.0002, 30.0, 330.0, 35786, epoch=epoch, revnum=4000),
        make_tle(38098, "SES-3", 0.02, 87.0, 0.0002, 80.0, 280.0, 35786, epoch=epoch, revnum=4200),
        make_tle(24946, "IRIDIUM 33 (COMSAT)", 86.4, 30.0, 0.0002, 90.0, 270.0, 780, epoch=epoch, revnum=70000),
    ]
    datasets["communications"] = comm

    # --- Navigation (GNSS: GPS, GLONASS, Galileo, BeiDou) ---
    nav = [
        make_tle(39533, "GPS BIIF-2", 55.03, 62.6, 0.013, 57.2, 303.7, 20180, epoch=epoch, revnum=5100),
        make_tle(41019, "GPS BIIF-11", 54.9, 182.6, 0.006, 200.0, 160.0, 20180, epoch=epoch, revnum=5300),
        make_tle(32393, "GLONASS-M 730", 64.6, 275.5, 0.001, 83.6, 276.7, 19140, epoch=epoch, revnum=9600),
        make_tle(41859, "GALILEO 14", 56.98, 61.6, 0.0002, 273.1, 86.9, 23222, epoch=epoch, revnum=3200),
        make_tle(43001, "BEIDOU-3 M1", 55.0, 150.0, 0.001, 100.0, 260.0, 21500, epoch=epoch, revnum=1800),
    ]
    datasets["navigation"] = nav

    # --- Debris ---
    debris = [
        make_tle(34454, "FENGYUN 1C DEB", 98.9, 200.0, 0.02, 120.0, 240.0, 850, epoch=epoch, revnum=90000),
        make_tle(34427, "COSMOS 2251 DEB", 74.0, 50.0, 0.015, 200.0, 160.0, 810, epoch=epoch, revnum=88000),
        make_tle(33797, "IRIDIUM 33 DEB", 86.4, 300.0, 0.02, 250.0, 110.0, 700, epoch=epoch, revnum=91000),
    ]
    datasets["debris"] = debris

    # --- Other active (misc LEO smallsats / cubesats) ---
    other = []
    base_id2 = 50001
    for i in range(6):
        other.append(make_tle(
            base_id2 + i, f"CUBESAT-DEMO-{i+1}", 45.0 + i * 8,
            (i * 60) % 360, 0.001, (i * 23) % 360, (i * 51) % 360,
            500 + i * 20, epoch=epoch, revnum=1000 + i))
    datasets["other"] = other

    for key, sats in datasets.items():
        path = os.path.join(OUT_DIR, f"{key}.json")
        with open(path, "w") as f:
            json.dump({
                "generated": epoch.isoformat(),
                "source": "seed (synthetic, physically-plausible placeholder — see scripts/update_tle.py for live CelesTrak data)",
                "satellites": sats
            }, f, indent=2)
        print(f"wrote {len(sats):>3} satellites -> {path}")


if __name__ == "__main__":
    main()
