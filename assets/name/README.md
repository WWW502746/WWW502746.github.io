# Name Experience Assets

The public experience is a typographic interpretation, not a historical rubbing search. No watermarked prototype images, fabricated historical hits, dates, original inscriptions, or invented stele coordinates are distributed.

## Fonts

Four fonts from the Google Fonts repository are redistributed under the supplied, unmodified SIL Open Font License 1.1 texts:

- https://github.com/google/fonts/tree/main/ofl/zcoolxiaowei
- https://github.com/google/fonts/tree/main/ofl/mashanzheng
- https://github.com/google/fonts/tree/main/ofl/longcang
- https://github.com/google/fonts/tree/main/ofl/zhimangxing

The WOFF2 files are lossless web-format conversions of the original TTFs, without glyph changes or subsetting. `coverage.json` is generated from their actual cmap tables, so missing glyphs are reported instead of silently showing a fallback glyph. `scripts/build-name-fonts.py` uses fontTools and Brotli to reproduce these files from the upstream TTFs in `fonts/`.

## Profiles And Rendering

`profiles.json` contains the existing prototype's 24 aesthetic profiles and normalized visual axes, extracted with `scripts/migrate-name-profiles.cjs`. Historical source tables were intentionally not migrated. Profiles describe selected visual qualities, not a validated psychological assessment.

The same font-rendered, texture-masked glyph canvas is used in the candidate preview and the downloadable PNG. The existing generated `assets/surface-02.png` provides the stone grain. Names and selections remain in browser session storage; they are not sent to a server or added to URLs. Exports contain an interpretation label and a deterministic composition identifier, not a promised globally unique archival record.

## Entry Image

`entry-stone.png` was generated once with built-in image_gen using the approved entry concept as a reference. Prompt: Edit the supplied reference into one clean photographic 16:9 background. Remove all interface text, navigation, controls, labels, dividers, and thumbnails. Retain ink-black carved stone, lifted thin rubbing paper, neutral silver raking light, and one weathered white Wang character on the right. Keep the left 45% quiet and near-black. No added text, logo, watermark, or sepia.

## Distribution

The deployment copies only `entry-stone.png`, `coverage.json`, `profiles.json`, WOFF2 fonts, and their OFL files. Original TTFs, design screenshots, private scripts, and prototype source data are not public assets.
