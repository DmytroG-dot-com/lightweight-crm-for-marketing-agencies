"use client";

import { useRouter, usePathname } from "next/navigation";
import { type FormEvent, type ReactNode, useTransition } from "react";

export function AutoFilterForm({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function applyFilters(form: HTMLFormElement) {
    const params = new URLSearchParams();
    for (const [name, value] of new FormData(form).entries()) {
      if (typeof value === "string" && value) params.append(name, value);
    }
    const query = params.toString();
    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    applyFilters(event.currentTarget);
  }

  function handleChange(event: FormEvent<HTMLFormElement>) {
    applyFilters(event.currentTarget);
  }

  return (
    <form
      className={className}
      onChange={handleChange}
      onSubmit={handleSubmit}
      aria-busy={isPending}
      data-pending={isPending}
    >
      {children}
    </form>
  );
}
