import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const asset = searchParams.get("asset") || undefined;
  const interval = searchParams.get("interval") || undefined;
  const indicator = searchParams.get("indicator") || undefined; // RSI | MACD
  const kind = searchParams.get("kind") || undefined; // bullish | bearish
  const limit = Math.min(parseInt(searchParams.get("limit") || "200", 10), 2000);

  const rows = await prisma.divergence.findMany({
    where: {
      ...(asset ? { asset } : {}),
      ...(interval ? { interval } : {}),
      ...(indicator ? { indicator } : {}),
      ...(kind ? { kind } : {}),
    },
    orderBy: { ts: "desc" },
    take: limit,
  });

  return Response.json({ count: rows.length, rows: rows.reverse() });
}

