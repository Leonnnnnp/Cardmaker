import { z } from "zod";

export const Color = z.string(); // "#RRGGBB" oder css var
export const CardSchema = z.object({
  size: z.object({
    widthMM: z.number().default(63),
    heightMM: z.number().default(88),
    bleedMM: z.number().default(0),
    safeMM: z.number().default(2),
  }),
  title: z.object({
    text: z.string(),
    fontFamily: z.string().default("Inter"),
    fontSizePt: z.number().default(18),
    color: Color.default("#111111"),
    align: z.enum(["left","center","right"]).default("center"),
    paddingMM: z.number().default(2),
    heightMM: z.number().default(12),
    background: Color.optional(),
  }),
  art: z.object({
    src: z.string().optional(), // URL/Base64
    fit: z.enum(["contain","cover"]).default("contain"),
    topMM: z.number().default(12), // Beginn direkt unter Titel
    heightMM: z.number().default(48),
    background: Color.optional(),
    roundedMM: z.number().default(2),
  }),
  text: z.object({
    content: z.string(),
    fontFamily: z.string().default("Inter"),
    fontSizePt: z.number().default(12),
    color: Color.default("#111111"),
    align: z.enum(["left","center","right"]).default("left"),
    paddingMM: z.number().default(3),
    lineHeight: z.number().default(1.25),
    background: Color.optional(),
  }),
  border: z.object({
    color: Color.default("#333333"),
    widthMM: z.number().default(0.35),
    radiusMM: z.number().default(3),
  }),
  theme: z.object({
    primary: Color.default("#ffd166"),
    surface: Color.default("#fff7e6"),
    accent: Color.default("#ffecb3"),
  }).optional(),
});
export type Card = z.infer<typeof CardSchema>;
