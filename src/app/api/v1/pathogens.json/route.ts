import { PATHOGENS } from "@/lib/pathogens";

export const dynamic = "force-static";

export function GET() {
  return Response.json({
    pathogens: PATHOGENS.map(({ name, slug, en, color }) => ({ name, slug, en, color })),
  });
}
