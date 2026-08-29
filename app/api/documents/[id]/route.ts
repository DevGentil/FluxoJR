import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveScope, resolveCompanyIds } from "@/lib/scope";
import { requireUser } from "@/lib/auth";
import { attachmentHeader } from "@/lib/content-disposition";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    await requireUser();
  } catch {
    return new NextResponse("Não autorizado.", { status: 401 });
  }

  const document = await prisma.document.findUnique({ where: { id } });
  if (!document) {
    return new NextResponse("Documento não encontrado.", { status: 404 });
  }

  const scope = await getActiveScope();
  const companyIds = await resolveCompanyIds(scope);
  if (!companyIds.includes(document.companyId)) {
    return new NextResponse("Documento fora do escopo ativo.", { status: 403 });
  }

  return new NextResponse(new Uint8Array(document.content), {
    headers: {
      "Content-Type": document.mimeType,
      "Content-Disposition": attachmentHeader(document.fileName),
      "Content-Length": String(document.size),
    },
  });
}
