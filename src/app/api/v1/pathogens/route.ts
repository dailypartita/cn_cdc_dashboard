import { PATHOGENS } from "@/lib/pathogens";
import { jsonResponse, optionsResponse } from "@/lib/api/http";

export const revalidate = 86400;

export function OPTIONS() {
  return optionsResponse();
}

export function GET() {
  return jsonResponse({
    pathogens: PATHOGENS.map(({ name, slug, en, color }) => ({ name, slug, en, color })),
  });
}
