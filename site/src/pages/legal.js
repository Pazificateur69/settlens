// /legal: legal notice required by French law (LCEN, art. 6 III). Identity data comes from
// site.legal in data/site.js; French text is marked lang="fr".

import { site } from "../data/site.js";
import { crumbs, documentBody } from "./_company.js";

const { legal: LEGAL } = site;

export const meta = {
  path: "/legal",
  title: "Legal notice (Mentions légales)",
  label: "Legal notice",
  description:
    "Legal notice for settlens.com: publisher Alessandro Gagliardi (EI, trade name Pazent), SIREN and SIRET, publication director, IONOS host, IP and liability.",
  section: "legal",
  lastmod: "2026-10-14",
  changefreq: "yearly",
  priority: 0.2,
  breadcrumbs: crumbs("Legal notice", "/legal"),
  summary: `settlens.com is published by ${LEGAL.publisher}, a French sole proprietor (EI) trading as ${LEGAL.tradeName}, SIREN ${LEGAL.siren.replace(/^(\d{3})(\d{3})(\d{3})$/, "$1 $2 $3")}; the publication director is ${LEGAL.publicationDirector}. ${LEGAL.offering} is an offering of ${LEGAL.tradeName}. The site is hosted by ${LEGAL.host.name} in the European Union and governed by French law.`,
};

export default function render(ctx) {
  const { html, site } = ctx;
  const { legal } = site;
  const { address, host } = legal;
  const mail = html`<a href="mailto:${legal.email}">${legal.email}</a>`;
  const postal = html`${address.street}, ${address.postalCode} ${address.city}, ${address.country}`;
  const siren = legal.siren.replace(/^(\d{3})(\d{3})(\d{3})$/, "$1 $2 $3");
  const siret = legal.siret.replace(/^(\d{3})(\d{3})(\d{3})(\d{5})$/, "$1 $2 $3 $4");
  // Bilingual label: the French half is marked so screen readers switch voice (WCAG 3.1.2).
  const fr = (french, english) => html`<span lang="fr">${french}</span> / ${english}`;

  const sections = [
    {
      id: "editeur",
      title: fr("Éditeur du site", "Publisher"),
      body: html`<p lang="fr">Le site <strong>settlens.com</strong> est édité par ${legal.publisher}, ${legal.status.replace(/^E/, "e")}, exerçant sous le nom commercial ${legal.tradeName}. ${legal.offering} est une offre de ${legal.tradeName}.</p>
<p>The settlens.com website is published by ${legal.publisher}, a French sole proprietor (<span lang="fr">entrepreneur individuel</span>, EI) trading as ${legal.tradeName}. ${legal.offering} is an offering of ${legal.tradeName}.</p>
${ctx.keyValues([
  { term: fr("Éditeur", "Publisher"), value: html`${legal.publisher}, <span lang="fr">${legal.status}</span>` },
  { term: fr("Nom commercial", "Trade name"), value: legal.tradeName },
  { term: fr("Offre", "Offering"), value: legal.offering },
  { term: fr("Adresse", "Address"), value: postal },
  { term: "SIREN", value: siren },
  { term: "SIRET", value: siret },
  { term: "E-mail", value: mail },
  { term: fr("Téléphone", "Phone"), value: html`<a href="${legal.phoneHref}">${legal.phoneIntl}</a>` },
])}`,
    },
    {
      id: "directeur-publication",
      title: fr("Directeur de la publication", "Publication director"),
      body: html`<p lang="fr">Le directeur de la publication est ${legal.publicationDirector}, joignable à l'adresse ${mail}.</p>
<p>The publication director is ${legal.publicationDirector}, who can be reached at ${mail}.</p>`,
    },
    {
      id: "hebergeur",
      title: fr("Hébergeur", "Hosting provider"),
      body: html`<p lang="fr">Le site est hébergé par ${host.name}, ${host.street}, ${host.postalCode} ${host.city}, Allemagne. Téléphone : ${host.phone}.</p>
<p>The website is hosted by ${host.name}, ${host.street}, ${host.postalCode} ${host.city}, ${host.country}. The site is served from a server located in the European Union. Infrastructure details are on the <a href="/security#infrastructure">security page</a>.</p>
${ctx.keyValues([
  { term: fr("Hébergeur", "Host"), value: host.name },
  { term: fr("Adresse", "Address"), value: `${host.street}, ${host.postalCode} ${host.city}, ${host.country}` },
  { term: fr("Téléphone", "Phone"), value: html`<a href="${host.phoneHref}">${host.phoneIntl}</a>` },
])}`,
    },
    {
      id: "propriete-intellectuelle",
      title: fr("Propriété intellectuelle", "Intellectual property"),
      body: html`<p lang="fr">Les textes, schémas, illustrations, le nom et le logo ${legal.offering}, ainsi que le code du site sont la propriété de l'éditeur, sauf mention contraire. Toute reproduction, représentation ou adaptation, totale ou partielle, sans autorisation écrite préalable de l'éditeur est interdite, sauf dans les limites prévues par le Code de la propriété intellectuelle (courte citation avec indication de la source, notamment).</p>
<p>The text, diagrams, illustrations, the ${legal.offering} name and logo and the site code belong to the publisher unless stated otherwise. Any reproduction or adaptation, in whole or in part, requires the publisher's prior written permission, except where the French Intellectual Property Code allows it (for example a short quotation with its source).</p>
<p>Names of protocols, standards and products cited on this site, such as x402, EIP-3009, GitHub or Claude, belong to their respective owners. Citing them does not imply any partnership or endorsement.</p>`,
    },
    {
      id: "responsabilite",
      title: fr("Responsabilité", "Liability"),
      body: html`<p lang="fr">Les informations publiées sur ce site sont fournies à titre d'information générale. L'éditeur s'efforce de les tenir exactes et à jour, sans pouvoir garantir l'absence d'erreur ni la disponibilité permanente du site. Les rapports et décisions produits par ${legal.offering} décrivent un comportement observé à un instant donné : ils ne constituent ni une certification, ni un conseil juridique. L'éditeur n'est pas responsable du contenu des sites tiers vers lesquels pointent des liens.</p>
<p>Information on this site is provided for general purposes. The publisher works to keep it accurate and current but cannot guarantee that it is free of errors or that the site is always available. ${legal.offering} reports and decisions describe behavior observed at a point in time; they are not a certification or legal advice. The publisher is not responsible for the content of third-party sites linked from this site. The <a href="/terms">terms of use</a> set out the rules for using the site and its tools.</p>`,
    },
    {
      id: "donnees-personnelles",
      title: fr("Données personnelles et cookies", "Personal data and cookies"),
      body: html`<p lang="fr">Le traitement des données personnelles est décrit dans la <a href="/privacy">politique de confidentialité</a>. Les pages publiques ne déposent aucun cookie ; la connexion à l’espace privé utilise un cookie de session. Aucun outil de mesure d’audience n’est utilisé (voir la <a href="/cookies">page cookies</a>).</p>
<p>How personal data is processed is described in the <a href="/privacy">privacy notice</a>. Public pages set no cookies; private sign-in uses a session cookie. The site uses no analytics (see the <a href="/cookies">cookie notice</a>).</p>`,
    },
    {
      id: "droit-applicable",
      title: fr("Droit applicable", "Governing law"),
      body: html`<p lang="fr">Le présent site et les présentes mentions sont soumis au droit français.</p>
<p>This website and this notice are governed by French law. For any question, write to ${mail} or use the <a href="/contact">contact page</a>.</p>`,
    },
  ];

  return html`${ctx.hero({
    title: "Legal notice",
    lede: html`<span lang="fr">Mentions légales</span> of settlens.com: who publishes the site, who hosts it, and the rules on intellectual property and liability.`,
  })}
${documentBody({
  sections,
  footer: html`<p><small>Last updated <time datetime="${ctx.page.lastmod}">${ctx.formatDate(ctx.page.lastmod)}</time>.</small></p>`,
})}`;
}
