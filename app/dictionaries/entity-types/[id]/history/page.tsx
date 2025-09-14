import { PrismaClient } from "@prisma/client";

export const revalidate = 0;

export default async function EntityTypeHistoryPage({ params }: { params: { id: string } }) {
  const prisma = new PrismaClient();
  const idNum = Number(params.id);
  const logs = await prisma.auditLog.findMany({
    where: { table: "entity_types", recordId: BigInt(idNum) },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { createdAt: true, action: true, userEmail: true, changes: true },
  });

  return (
    <div className="mx-auto max-w-[800px] px-6 py-8">
      <h1 className="text-2xl font-semibold mb-4">Entity Type History #{idNum}</h1>
      {logs.length === 0 ? (
        <p className="text-gray-500">No audit records.</p>
      ) : (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-50">
              <th className="border px-2 py-1 text-left w-48">When</th>
              <th className="border px-2 py-1 text-left w-28">Action</th>
              <th className="border px-2 py-1 text-left w-64">User</th>
              <th className="border px-2 py-1 text-left">Changes</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l, i) => (
              <tr key={i} className="odd:bg-white even:bg-gray-50">
                <td className="border px-2 py-1">{l.createdAt.toISOString()}</td>
                <td className="border px-2 py-1">{l.action}</td>
                <td className="border px-2 py-1">{l.userEmail ?? ""}</td>
                <td className="border px-2 py-1 text-xs">
                  <pre className="whitespace-pre-wrap break-words">{JSON.stringify(l.changes ?? null, null, 2)}</pre>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

