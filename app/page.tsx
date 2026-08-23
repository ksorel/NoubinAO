import Link from "next/link";
import { Suspense } from "react";
import { AuthButton } from "@/components/auth-button";
import { Logo } from "@/components/logo";
import { Hero } from "@/components/marketing/hero";
import { Constat } from "@/components/marketing/constat";
import { CommentCaMarche } from "@/components/marketing/comment-ca-marche";
import { Modules } from "@/components/marketing/modules";
import { Tarifs } from "@/components/marketing/tarifs";
import { CtaFinal } from "@/components/marketing/cta-final";
import { SiteFooter } from "@/components/marketing/site-footer";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col">
      <nav className="w-full flex justify-center border-b h-16">
        <div className="w-full max-w-5xl flex justify-between items-center px-5">
          <Link href="/">
            <Logo className="h-8 w-auto" />
          </Link>
          <Suspense>
            <AuthButton />
          </Suspense>
        </div>
      </nav>

      <Hero />
      <Constat />
      <CommentCaMarche />
      <Modules />
      <Tarifs />
      <CtaFinal />
      <SiteFooter />
    </main>
  );
}
