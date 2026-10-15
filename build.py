"""Build the offline piano webpage from its source and attributed piano samples."""
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parent
page = (ROOT / "piano-page.html").read_text(encoding="utf-8")
import base64
# The filenames use note names; convert them to MIDI numbers for nearest-sample playback.
NOTE_NUMBER = {"C": 0, "Cs": 1, "D": 2, "Ds": 3, "E": 4, "F": 5, "Fs": 6,
              "G": 7, "Gs": 8, "A": 9, "As": 10, "B": 11}
samples = {}
for mp3 in (ROOT / "assets" / "samples").glob("*.mp3"):
    stem = mp3.stem
    for split in range(1, len(stem)):
        note, octave = stem[:split], stem[split:]
        if note in NOTE_NUMBER and octave.isdigit():
            samples[12 * (int(octave) + 1) + NOTE_NUMBER[note]] = base64.b64encode(mp3.read_bytes()).decode("ascii")
            break
if len(samples) != 21:
    raise SystemExit(f"Expected 21 licensed piano samples; found {len(samples)}.")

replacements = {
    "__PIANO_SAMPLES__": json.dumps(samples, separators=(",", ":")),
    "__PIANO_ENGINE__": (ROOT / "piano-engine.js").read_text(encoding="utf-8"),
    "__PIANO_APP__": (ROOT / "piano-app.js").read_text(encoding="utf-8"),
}
for marker, content in replacements.items():
    if marker not in page:
        raise SystemExit(f"Missing build marker: {marker}")
    page = page.replace(marker, content, 1)
if "__PIANO_" in page:
    raise SystemExit("An unfilled build marker remains.")
destination = ROOT / "dist" / "index.html"
destination.parent.mkdir(parents=True, exist_ok=True)
destination.write_text(page, encoding="utf-8")
print(f"Built {destination} ({destination.stat().st_size:,} bytes; {len(samples)} piano recordings).")
