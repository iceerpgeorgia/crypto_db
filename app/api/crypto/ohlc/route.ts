import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const asset = searchParams.get("asset") || "bitcoin";
  const interval = searchParams.get("interval") || "1d";
  const limit = Math.min(parseInt(searchParams.get("limit") || "200", 10), 2000);

  const rows = await prisma.oHLC.findMany({
    where: { asset, interval },
    orderBy: { ts: "desc" },
    take: limit,
  });

  return Response.json({ asset, interval, count: rows.length, rows: rows.reverse() });
}
