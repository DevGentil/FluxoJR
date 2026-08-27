import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveScope, resolveCompanyIds } from "@/lib/scope";
import { requireUser } from "@/lib/auth";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    await requireUser();
  } catch {
    return new NextResponse("Não autorizado.", { status: 401 });
  }

  const report = await prisma.dreReport.findUnique({ where: { id } });
  if (!report) {
    return new NextResponse("DRE realizado não encontrado.", { status: 404 });
  }

  const scope = await getActiveScope();
  const companyIds = await resolveCompanyIds(scope);
  if (!companyIds.includes(report.companyId)) {
    return new NextResponse("Arquivo fora do escopo ativo.", { status: 403 });
  }

  return new NextResponse(new Uint8Array(report.content), {
    headers: {
      "Content-Type": report.mimeType,
      "Content-Disposition": `attachment; filename="${encodeURIComponent(report.fileName)}"`,
      "Content-Length": String(report.size),
    },
  });
}
