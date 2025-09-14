import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const TABLES = new Set(["countries", "entity_types", "counteragents"]);

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const table = url.searchParams.get("table") || "";
    const id = url.searchParams.get("id") || "";
    if (!TABLES.has(table)) return NextResponse.json({ error: "Invalid table" }, { status: 400 });
    const idNum = Number(id);
    if (!Number.isFinite(idNum) || idNum <= 0) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const rows = await prisma.auditLog.findMany({
      where: { table, recordId: BigInt(idNum) },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { createdAt: true, action: true, userEmail: true, changes: true },
    });

    const data = rows.map((r) => ({
      createdAt: r.createdAt.toISOString(),
      action: r.action,
      userEmail: r.userEmail ?? "",
      changes: r.changes ?? null,
    }));

    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Server error" }, { status: 500 });
  }
}

