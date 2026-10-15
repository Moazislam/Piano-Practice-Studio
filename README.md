# Piano Practice Studio

A self-contained piano practice webpage. It plays recorded grand-piano samples locally in the browser; after the page loads, it needs no network connection.

## Play

Open `dist/index.html` in a current desktop or mobile browser and select **Start piano** to enable audio. Play by clicking or touching the keys, or press the displayed letter keys. Hold several keys for a chord. Drag across keys to play glissandos, hold Space for the sustain pedal, and press Escape to stop the notes. The C major exercise marks notes in sequence. The tempo, octave, volume, touch, room, and brightness controls can be adjusted as you play; preferences are saved in local browser storage.

Keyboard input needs only a file opened in the browser. For the most consistent browser audio permissions, the site can also be served from any static file server.

## Rebuild

Python 3 is the only build requirement:

```powershell
python build.py
```

This embeds the 21 licensed piano recordings and both JavaScript files into `dist/index.html`. The sample MP3 files are kept in `assets/samples/`; the HTML, CSS, audio engine, and practice controls are also available separately for editing.

## Piano recordings

The recorded instrument is Salamander Grand Piano V2, a Yamaha C5 recorded by Alexander Holm. The sample recordings are licensed under Creative Commons Attribution 3.0. See [Piano sample attribution](ATTRIBUTION.md) for the license and source.
