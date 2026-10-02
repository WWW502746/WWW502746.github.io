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

`profiles.json` contains the four families and 16 personality narratives supplied for this experience. Every chosen glyph votes for a family: 方正 → 刻石思者, 疏朗 → 镌心者, 浑厚 → 守石者, 流动 → 观石者. The most common style wins; a tie goes to whichever tied style was chosen first. The seven visual axes in the expandable writing spectrum average all chosen glyphs.

The six finishing choices vote for one of the four readings within that family. Stone and ink count two votes each; paper, rubbing pressure, carving, and weathering count one each. Ties use the stone reading, then the ink reading, then the first reading in order. The exact table is:

| Choice | Reading 1 | Reading 2 | Reading 3 | Reading 4 |
| --- | --- | --- | --- | --- |
| Stone (2 votes) | 青石 | 汉白玉 | 花岗岩 | 砂岩 |
| Ink (2 votes) | 松烟乌金 | 石墨淡墨 | 朱砂矿物 | 赭石古墨 |
| Paper (1 vote) | 生宣纸、仿古籍宣纸 | 棉麻手工纸、蝉翼宣纸 | — | 粗麻纸、裂纹宣纸 |
| Pressure (1 vote) | — | 轻拓 | 重拓 | — |
| Carving (1 vote) | 阴刻 | — | 阳刻 | — |
| Weathering (1 vote) | — | — | — | 残碑风化开启 |

Thus each of the 16 profiles is reachable with a single character that is covered by all four fonts. The rubbing preview omits the result name until the visitor completes the rubbing; the final poster includes it. These are artistic readings, not a validated psychological assessment.

The same font-rendered glyph is used in the selected style and downloadable PNG. `assets/surface-02.png` gives the candidate glyphs stone grain; `assets/name/materials/` supplies the stone and paper textures for the rubbing. Names and selections remain in browser session storage; they are not sent to a server or added to URLs. Final exports contain an interpretation label and a deterministic composition identifier, not a promised globally unique archival record.

## Entry Image

`entry-stone.png` was generated once with built-in image_gen using the approved entry concept as a reference. Prompt: Edit the supplied reference into one clean photographic 16:9 background. Remove all interface text, navigation, controls, labels, dividers, and thumbnails. Retain ink-black carved stone, lifted thin rubbing paper, neutral silver raking light, and one weathered white Wang character on the right. Keep the left 45% quiet and near-black. No added text, logo, watermark, or sepia.

## Distribution

The deployment copies `entry-stone.png`, `coverage.json`, `profiles.json`, the compressed stone and paper materials, WOFF2 fonts, and their OFL files. Original TTFs, design screenshots, private scripts, and prototype source data are not public assets.
