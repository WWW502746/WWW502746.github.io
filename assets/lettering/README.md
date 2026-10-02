# Beijian Title Artwork

The homepage and name-entry lettering uses the exact approved image rather than a substitute font. `approved-titles.png` is the approved composition; `lettering.js` displays only the two measured title regions. `work-titles.png` and `section-titles.png` are generated companion lettering sheets. A live luminance-to-alpha mask removes the black ground, retaining the source artwork unchanged and avoiding rectangular patches over photographs.

All artwork was generated with the built-in image generation tool. The brief was light, normal-proportioned handwritten Chinese lettering matching the approved mockup, without seal-script elongation, carved texture or punctuation. The companion sheets contain the existing seven work names and fixed section titles. They are illustrations, not a downloadable font or historical calligraphy reproductions.

Regions preserve their aspect ratios and include a small margin around the visible ink. `design/beijian-typography/inspect-lettering.cjs` inspects source pixel bounds without editing the images. Accessible source text remains in the DOM, and failed image loads leave readable text in place. Dynamic names and game glyphs do not use these sheets.
