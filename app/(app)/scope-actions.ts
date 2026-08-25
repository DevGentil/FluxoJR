"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

const COOKIE_NAME = "fluxojr_scope";

export async function setActiveScope(value: string) {
  const store = await cookies();
  store.set(COOKIE_NAME, value, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  revalidatePath("/", "layout");
}
