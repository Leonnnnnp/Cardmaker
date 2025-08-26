#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import PDFDocument from "pdfkit";
import { CardSchema } from "@schemas/card";
import { renderCardSVG } from "@card-renderer/renderCard";

async function main() {
  const jsonPath = process.argv[2]; // z.B. examples/card.json oder examples/deck.json
  if(!jsonPath) {
    console.error("Usage: pnpm export examples/deck.json");
    process.exit(1);
  }

  const raw = await fs.readFile(jsonPath, "utf8");
  const data = JSON.parse(raw);
  const cards = Array.isArray(data) ? data : [data];

  await fs.mkdir("dist/png", { recursive: true });

  const pngBuffers: Buffer[] = [];
  for (let i=0; i<cards.length; i++){
    const parsed = CardSchema.parse(cards[i]);
    const svg = renderCardSVG(parsed);
    const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
    pngBuffers.push(png);
    await fs.writeFile(`dist/png/card_${String(i+1).padStart(2,"0")}.png`, png);
  }

  // PDF A4 Bogen mit Schnittmarken (4 Karten pro Seite, 12mm Rand, 10mm Abstand)
  const mmToPt = (mm: number) => mm * 72 / 25.4;
  const A4 = { w: mmToPt(210), h: mmToPt(297) };
  const margin = mmToPt(12);
  const gap = mmToPt(10);
  const cardW = mmToPt(63);
  const cardH = mmToPt(88);

  const doc = new PDFDocument({ size: [A4.w, A4.h], margin });
  doc.pipe((await import("fs")).createWriteStream("dist/cards_A4.pdf"));

  let x = margin, y = margin, col = 0, row = 0;
  for (let i=0; i<pngBuffers.length; i++){
    doc.image(pngBuffers[i], x, y, { width: cardW, height: cardH });
    // Rahmen/Schnitt
    doc.lineWidth(0.5).strokeColor("#777").rect(x, y, cardW, cardH).stroke();

    col++;
    if (col === 2){ col = 0; row++; x = margin; y += cardH + gap; }
    else { x += cardW + gap; }

    if (row === 2 && i < pngBuffers.length - 1){
      doc.addPage({ size: [A4.w, A4.h], margin });
      x = margin; y = margin; col = row = 0;
    }
  }

  doc.end();
  console.log("✓ export -> dist/png/*.png & dist/cards_A4.pdf");
}

main().catch(e=>{ console.error(e); process.exit(1); });
