import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const assets = (searchParams.get("assets") || "BTC,ETH,USDT").split(",").map((s) => s.trim()).filter(Boolean);
  const interval = searchParams.get("interval") || "daily";
  const limit = Math.min(parseInt(searchParams.get("limit") || "200", 10), 2000);

  const result: Record<string, any[]> = {};
  for (const asset of assets) {
    const rows = await prisma.dominancePoint.findMany({
      where: { asset, interval },
      orderBy: { ts: "desc" },
      take: limit,
    });
    result[asset] = rows.reverse();
  }

  return Response.json({ interval, assets, series: result });
}

