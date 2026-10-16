# Piano Practice Studio

A self-contained piano practice webpage. It plays recorded grand-piano samples locally in the browser; after the page loads, it needs no network connection.

## Play

Open `dist/index.html` in a current desktop or mobile browser and select **Start piano** to enable audio. Play by clicking or touching the keys, or press the displayed letter keys. Hold several keys for a chord. Drag across keys to play glissandos, hold Space for the sustain pedal, and press Escape to stop the notes. Choose one or two visible octaves, or explore the full 88-key A0–C8 piano by scrolling. The shortcut octave selector and Left/Right arrow keys move the computer-keyboard mapping. The C major exercise marks notes in sequence. The tempo, octave, volume, touch, room, and brightness controls can be adjusted as you play; preferences are saved in local browser storage.

Keyboard input needs only a file opened in the browser. For the most consistent browser audio permissions, the site can also be served from any static file server.

## Guided tutorials

Choose a level and a famous piece:

- **Beginner:** Ode to Joy; Twinkle, Twinkle, Little Star.
- **Intermediate:** Für Elise; Canon in D.
- **Advanced:** Moonlight Sonata; Turkish March.

These are simplified opening excerpts of public-domain melodies, not complete scores. **Listen & follow** plays the excerpt with blue key highlights and a moving melody strip. **Practice step by step** marks the next keys in gold and waits for correct notes; chords require every marked note. Tutorials select a suitable range and scroll keys into view on small screens.

Playback, highlights, and the optional metronome share the Web Audio clock. BPM changes apply to both playback and clicks. Pause/Resume repeats the current step; Restart begins the excerpt again. Enable **Loop excerpt** to repeat playback or practice. Escape, leaving the tab, and losing focus stop sound and pause playback. Saved preferences include range, level, piece, and sound settings.

## Check

```powershell
node --test tests/lessons.test.js
```

Tests cover score ranges, beat timing, output-latency compensation, synchronized clicks, cancellation, resume, interruptions, and completion.

## Rebuild

Python 3 is the only build requirement:

```powershell
python build.py
```

This embeds the 21 licensed piano recordings and all three JavaScript files into `dist/index.html`. The sample MP3 files are kept in `assets/samples/`; the HTML, CSS, audio engine, and practice controls are also available separately for editing.

## Piano recordings

The recorded instrument is Salamander Grand Piano V2, a Yamaha C5 recorded by Alexander Holm. The sample recordings are licensed under Creative Commons Attribution 3.0. See [Piano sample attribution](ATTRIBUTION.md) for the license and source.
