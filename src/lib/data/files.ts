export const DATA_FILES = [
  "cncdc_surveillance_all.csv",
  "cncdc_surveillance_covid19.csv",
  "cncdc_suverillance_2025_14_22.csv",
] as const;

export type DataFileName = (typeof DATA_FILES)[number];

export function isDataFile(name: string): name is DataFileName {
  return (DATA_FILES as readonly string[]).includes(name);
}

export const NOTIFIABLE_FILE = "notifiable_all.csv";

export const VARIANT_FILE = "covid_variants.csv";

export function isDownloadFile(
  name: string,
): name is DataFileName | typeof NOTIFIABLE_FILE | typeof VARIANT_FILE {
  return isDataFile(name) || name === NOTIFIABLE_FILE || name === VARIANT_FILE;
}
