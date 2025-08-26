import { Card } from "@schemas/card";
import { mmToPx } from "./units"; // 1in=25.4mm, px = in*300 für 300dpi falls nötig

export function renderCardSVG(card: Card) {
  const w = card.size.widthMM;
  const h = card.size.heightMM;
  const bleed = card.size.bleedMM;

  // SVG viewBox: ohne Bleed definieren (Bleed extern dazupacken wenn gewünscht)
  const viewW = 744;  // 63mm @300dpi
  const viewH = 1039; // 88mm @300dpi

  // Hilfsfunktionen:
  const mmToView = (mm: number) => mm * (viewW / 63); // linear skalieren

  const borderR = mmToView(card.border.radiusMM);
  const borderW = mmToView(card.border.widthMM);

  const titleH  = mmToView(card.title.heightMM);
  const titlePad= mmToView(card.title.paddingMM);
  const artTop  = mmToView(card.art.topMM);
  const artH    = mmToView(card.art.heightMM);
  const textPad = mmToView(card.text.paddingMM);

  const titleAnchor = (() => {
    if (card.title.align === "left") return "start";
    if (card.title.align === "right") return "end";
    return "middle";
  })();

  // Text y-Positionen
  const textTop = artTop + artH + mmToView(2);
  const textAreaH = viewH - textTop - mmToView(2);

  // Optionaler Titelhintergrund
  const titleBg = card.title.background
    ? `<rect x="0" y="0" width="${viewW}" height="${titleH}"
         fill="${card.title.background}" rx="${borderR}" ry="${borderR}" />`
    : "";

  // Bild Objektfit über <image> mit preserveAspectRatio
  const preserve = card.art.fit === "cover" ? "xMidYMid slice" : "xMidYMid meet";
  const artBg = card.art.background
    ? `<rect x="0" y="${artTop}" width="${viewW}" height="${artH}" fill="${card.art.background}" rx="${borderR}" ry="${borderR}" />`
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     width="${viewW}" height="${viewH}" viewBox="0 0 ${viewW} ${viewH}">
  <!-- Oberfläche -->
  <rect x="0" y="0" width="${viewW}" height="${viewH}" fill="${card.theme?.surface ?? "#ffffff"}" rx="${borderR}" ry="${borderR}" />
  <!-- Rand -->
  <rect x="${borderW/2}" y="${borderW/2}" width="${viewW - borderW}" height="${viewH - borderW}"
        fill="none" stroke="${card.border.color}" stroke-width="${borderW}" rx="${borderR}" ry="${borderR}"/>
  <!-- Titel -->
  ${titleBg}
  <text x="${card.title.align==="left"? titlePad : card.title.align==="right"? viewW - titlePad : viewW/2}"
        y="${titleH/2 + 2}"
        font-family="${card.title.fontFamily}" font-size="${card.title.fontSizePt}pt"
        fill="${card.title.color}" text-anchor="${titleAnchor}" dominant-baseline="middle">
    ${escapeXML(card.title.text)}
  </text>
  <!-- Art -->
  ${artBg}
  ${card.art.src ? `
    <clipPath id="artRadius">
      <rect x="0" y="${artTop}" width="${viewW}" height="${artH}" rx="${borderR}" ry="${borderR}"/>
    </clipPath>
    <image href="${card.art.src}" x="0" y="${artTop}" width="${viewW}" height="${artH}"
           preserveAspectRatio="${preserve}" clip-path="url(#artRadius)"/>
  ` : ""}

  <!-- Textfeld -->
  ${card.text.background ? `<rect x="0" y="${textTop}" width="${viewW}" height="${textAreaH}"
         fill="${card.text.background}" rx="${borderR}" ry="${borderR}" />` : ""}

  <foreignObject x="${textPad}" y="${textTop + textPad}" width="${viewW - 2*textPad}" height="${textAreaH - 2*textPad}">
    <div xmlns="http://www.w3.org/1999/xhtml"
         style="font-family:${card.text.fontFamily}; font-size:${card.text.fontSizePt}pt; line-height:${card.text.lineHeight}; color:${card.text.color};">
      ${escapeHTML(card.text.content)}
    </div>
  </foreignObject>
</svg>`;
}

function escapeXML(s: string){ return s.replace(/[<>&]/g, m => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[m]!)); }
function escapeHTML(s: string){ return s.replace(/[<>&]/g, m => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[m]!)); }
