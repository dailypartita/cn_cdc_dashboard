export type PathogenSymbol =
  | "circle"
  | "rect"
  | "roundRect"
  | "triangle"
  | "diamond"
  | "pin"
  | "arrow"
  | "star";

export type Pathogen = {
  name: string;
  slug: string;
  en: string;
  color: string;
  symbol: PathogenSymbol;
};

/** Order and styling follow China CDC weekly Table 1 / Figures 2–3. */
export const PATHOGENS: Pathogen[] = [
  { name: "新型冠状病毒", slug: "sars-cov-2", en: "SARS-CoV-2", color: "#2E75B6", symbol: "circle" },
  { name: "流感病毒", slug: "influenza", en: "Influenza", color: "#ED7D31", symbol: "rect" },
  { name: "呼吸道合胞病毒", slug: "rsv", en: "RSV", color: "#70AD47", symbol: "triangle" },
  { name: "腺病毒", slug: "adenovirus", en: "Adenovirus", color: "#9B59B6", symbol: "diamond" },
  { name: "人偏肺病毒", slug: "hmpv", en: "hMPV", color: "#00B0F0", symbol: "pin" },
  { name: "副流感病毒", slug: "piv", en: "Parainfluenza", color: "#FFC000", symbol: "arrow" },
  { name: "普通冠状病毒", slug: "hcov", en: "HCoV", color: "#7F7F7F", symbol: "roundRect" },
  { name: "博卡病毒", slug: "bocavirus", en: "Bocavirus", color: "#00B050", symbol: "star" },
  { name: "鼻病毒", slug: "rhinovirus", en: "Rhinovirus", color: "#C00000", symbol: "circle" },
  { name: "肠道病毒", slug: "enterovirus", en: "Enterovirus", color: "#5B9BD5", symbol: "rect" },
  { name: "肺炎支原体", slug: "mp", en: "M. pneumoniae", color: "#833C0C", symbol: "triangle" },
];

export const PATHOGEN_BY_NAME = new Map(PATHOGENS.map((p) => [p.name, p]));
export const PATHOGEN_BY_SLUG = new Map(PATHOGENS.map((p) => [p.slug, p]));

export function resolvePathogen(query: string | null): Pathogen | undefined {
  if (!query) return undefined;
  const q = query.trim();
  return PATHOGEN_BY_NAME.get(q) ?? PATHOGEN_BY_SLUG.get(q.toLowerCase());
}

export const DATA_FILES = [
  "cncdc_surveillance_all.csv",
  "cncdc_surveillance_covid19.csv",
  "cncdc_suverillance_2025_14_22.csv",
] as const;

export type DataFileName = (typeof DATA_FILES)[number];

export function isDataFile(name: string): name is DataFileName {
  return (DATA_FILES as readonly string[]).includes(name);
}
