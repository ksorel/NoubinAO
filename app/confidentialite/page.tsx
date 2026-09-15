import Link from "next/link";
import { Logo } from "@/components/logo";
import { SiteFooter } from "@/components/marketing/site-footer";

export const metadata = {
  title: "Politique de confidentialité — NoubinAO",
};

export default function PolitiqueConfidentialite() {
  return (
    <main className="min-h-screen flex flex-col">
      <nav className="w-full flex justify-center border-b h-16">
        <div className="w-full max-w-3xl flex justify-between items-center px-5">
          <Link href="/">
            <Logo className="h-8 w-auto" />
          </Link>
        </div>
      </nav>

      <article className="w-full max-w-3xl mx-auto px-5 py-12 flex flex-col gap-8 text-sm leading-relaxed">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold">Politique de confidentialité</h1>
          <p className="text-muted-foreground">Dernière mise à jour : 15 septembre 2026</p>
        </header>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">1. Responsable du traitement</h2>
          <p>
            NoubinAO est un produit édité par K-Nowledge (Abidjan, Côte
            d&apos;Ivoire), responsable du traitement des données décrites
            dans cette politique. Pour toute question ou demande relative à
            vos données personnelles, vous pouvez nous contacter à
            l&apos;adresse indiquée en section 10.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">2. Données que nous collectons</h2>
          <p>Selon votre usage de NoubinAO, nous collectons :</p>
          <ul className="list-disc pl-5 flex flex-col gap-1">
            <li>
              <strong>Données de compte</strong> : nom, adresse email, mot de
              passe (stocké de façon chiffrée par notre fournisseur
              d&apos;authentification), entreprise et rôle au sein de
              l&apos;équipe.
            </li>
            <li>
              <strong>Documents que vous téléversez</strong> : pièces
              administratives, références de projets, CV, dossiers d&apos;appels
              d&apos;offres (DAO), ainsi que le texte que nous en extrayons pour
              les traiter.
            </li>
            <li>
              <strong>Données de votre boîte Gmail, si vous connectez votre
              compte</strong> : voir la section 3 dédiée ci-dessous, qui
              détaille précisément cet usage.
            </li>
            <li>
              <strong>Données techniques</strong> : journaux de connexion,
              adresse IP, type de navigateur, à des fins de sécurité et de
              diagnostic technique.
            </li>
          </ul>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">
            3. Utilisation spécifique des données Gmail
          </h2>
          <p>
            NoubinAO propose une intégration optionnelle avec Gmail, que vous
            activez vous-même depuis vos réglages. Cette intégration utilise
            l&apos;autorisation Google <code>gmail.readonly</code>, qui donne un
            accès en <strong>lecture seule</strong> à votre boîte de réception
            — NoubinAO ne peut ni envoyer, ni modifier, ni supprimer d&apos;email
            en votre nom.
          </p>
          <p>Concrètement, une fois votre compte connecté :</p>
          <ul className="list-disc pl-5 flex flex-col gap-1">
            <li>
              Nous synchronisons automatiquement, une fois par heure, les
              emails reçus dans les 30 derniers jours (objet, expéditeur,
              destinataires, corps du message, métadonnées des pièces
              jointes — le contenu des pièces jointes elles-mêmes
              n&apos;est pas récupéré).
            </li>
            <li>
              Ces emails restent visibles uniquement par vous tant que vous ne
              les rattachez pas manuellement à un appel d&apos;offres. Une fois
              rattaché, l&apos;email devient visible par les autres membres de
              votre entreprise ayant accès à cet appel d&apos;offres, pour leur
              permettre de suivre les échanges avec l&apos;acheteur public.
            </li>
            <li>
              Aucun rattachement n&apos;est automatique : NoubinAO vous suggère
              des emails probablement liés à un appel d&apos;offres, mais c&apos;est
              toujours vous qui confirmez le lien.
            </li>
          </ul>
          <p>
            <strong>Engagement « Limited Use » (Google API Services User Data
            Policy).</strong> L&apos;usage que fait NoubinAO des données Gmail
            respecte la{" "}
            <a
              href="https://developers.google.com/terms/api-services-user-data-policy"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              Google API Services User Data Policy
            </a>
            , y compris ses exigences de « Limited Use » :
          </p>
          <ul className="list-disc pl-5 flex flex-col gap-1">
            <li>
              Nous n&apos;utilisons les données de votre boîte Gmail que pour
              fournir la fonctionnalité de suivi d&apos;appels d&apos;offres que
              vous avez explicitement activée — jamais à d&apos;autres fins.
            </li>
            <li>
              Nous ne transférons ni ne vendons ces données à des tiers à des
              fins publicitaires, de revente ou de développement de modèles
              d&apos;intelligence artificielle non liés à cette fonctionnalité.
            </li>
            <li>
              Nous ne permettons pas à des humains de lire le contenu de vos
              emails, sauf : avec votre consentement explicite, pour des
              raisons de sécurité (ex. enquête sur un abus), pour nous
              conformer à une obligation légale, ou dans le cadre d&apos;une
              opération interne (support technique) strictement nécessaire
              et limitée dans le temps.
            </li>
          </ul>
          <p>
            Vous pouvez déconnecter votre compte Gmail à tout moment depuis
            vos réglages NoubinAO — cela révoque immédiatement notre accès et
            arrête toute synchronisation future. Les emails déjà synchronisés
            restent dans NoubinAO jusqu&apos;à ce que vous les supprimiez ou que
            vous supprimiez votre compte (voir section 7).
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">4. Pourquoi nous utilisons ces données</h2>
          <ul className="list-disc pl-5 flex flex-col gap-1">
            <li>Fournir et faire fonctionner le service que vous avez souscrit.</li>
            <li>
              Analyser automatiquement vos dossiers d&apos;appels d&apos;offres
              (extraction des exigences, pièces requises, critères
              d&apos;évaluation) à l&apos;aide de l&apos;API Claude d&apos;Anthropic — voir
              section 5.
            </li>
            <li>Vous permettre de centraliser le suivi de vos échanges par email liés à un appel d&apos;offres.</li>
            <li>Assurer la sécurité, prévenir la fraude et diagnostiquer les incidents techniques.</li>
            <li>Vous contacter au sujet de votre compte ou d&apos;évolutions importantes du service.</li>
          </ul>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">
            5. Avec qui nous partageons vos données
          </h2>
          <p>
            Nous ne vendons jamais vos données. Nous les partageons
            uniquement avec les prestataires techniques nécessaires au
            fonctionnement de NoubinAO, chacun agissant comme sous-traitant
            sous nos instructions :
          </p>
          <ul className="list-disc pl-5 flex flex-col gap-1">
            <li>
              <strong>Supabase</strong> — hébergement de la base de données,
              authentification et stockage des fichiers.
            </li>
            <li>
              <strong>Anthropic (API Claude)</strong> — analyse automatisée du
              contenu de vos documents et dossiers d&apos;appels d&apos;offres, pour
              en extraire les exigences et assister la rédaction. Seul le
              texte nécessaire à la tâche demandée est transmis, jamais votre
              boîte Gmail dans son ensemble.
            </li>
            <li>
              <strong>Google</strong> — uniquement dans le cadre de la
              connexion OAuth que vous initiez vous-même pour lire votre
              boîte Gmail (voir section 3).
            </li>
            <li>
              <strong>Upstash (QStash)</strong> — orchestration technique des
              traitements différés (analyse de DAO, synchronisation email).
            </li>
            <li>
              <strong>CinetPay</strong> — traitement des paiements
              d&apos;abonnement, une fois cette fonctionnalité activée sur votre
              compte.
            </li>
          </ul>
          <p>
            Nous pouvons également divulguer des données si la loi nous y
            oblige, ou pour protéger les droits, la sécurité ou la propriété
            de NoubinAO, de ses utilisateurs ou du public.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">6. Sécurité</h2>
          <p>
            Les jetons d&apos;accès à votre compte Gmail sont chiffrés au repos
            (AES-256-GCM) et ne sont jamais exposés au navigateur. L&apos;accès
            aux données de votre entreprise est cloisonné au niveau de la
            base de données (contrôle d&apos;accès par ligne), de sorte qu&apos;une
            entreprise ne peut techniquement pas accéder aux données d&apos;une
            autre. Les communications avec NoubinAO sont chiffrées en
            transit (HTTPS).
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">7. Combien de temps nous conservons vos données</h2>
          <p>
            Nous conservons vos données tant que votre compte est actif. Si
            vous supprimez votre compte, ou nous en faites la demande, nous
            supprimons vos données dans un délai raisonnable, sauf obligation
            légale de conservation plus longue (ex. données de facturation).
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">8. Vos droits</h2>
          <p>Vous pouvez à tout moment :</p>
          <ul className="list-disc pl-5 flex flex-col gap-1">
            <li>Accéder aux données que nous détenons sur vous et en demander une copie.</li>
            <li>Demander la correction de données inexactes.</li>
            <li>Demander la suppression de votre compte et des données associées.</li>
            <li>Révoquer l&apos;accès à votre compte Gmail, à tout moment, depuis vos réglages.</li>
            <li>Retirer votre consentement pour tout traitement fondé sur celui-ci.</li>
          </ul>
          <p>
            Pour exercer ces droits, contactez-nous à l&apos;adresse indiquée en
            section 10. Vous disposez également d&apos;un droit de réclamation
            auprès de l&apos;Autorité de Régulation des Télécommunications/TIC de
            Côte d&apos;Ivoire (ARTCI), autorité compétente en matière de
            protection des données personnelles.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">9. Cookies</h2>
          <p>
            NoubinAO utilise des cookies strictement nécessaires au
            fonctionnement du service (session de connexion, préférence de
            thème clair/sombre, préférence de langue). Nous n&apos;utilisons pas
            de cookies publicitaires ni de traceurs tiers à des fins
            marketing.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">10. Nous contacter</h2>
          <p>
            Pour toute question sur cette politique ou vos données
            personnelles : <a href="mailto:contact@k-nowledge.ci" className="underline">contact@k-nowledge.ci</a>.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">11. Modifications de cette politique</h2>
          <p>
            Nous pouvons mettre à jour cette politique de temps à autre. Toute
            modification significative vous sera communiquée par email ou par
            une notification dans l&apos;application avant son entrée en
            vigueur.
          </p>
        </section>
      </article>

      <SiteFooter />
    </main>
  );
}
