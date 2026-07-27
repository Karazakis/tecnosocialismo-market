export type ProductGroup = "cibo" | "bevande" | "beni";

export type CategoryDefinition = {
  id: string;
  name: string;
  group: ProductGroup;
  mark: string;
  description: string;
};

export const categories: CategoryDefinition[] = [
  { id: "ortofrutta", name: "Ortofrutta", group: "cibo", mark: "OR", description: "Frutta, verdura, erbe e prodotti freschi." },
  { id: "cereali-legumi", name: "Cereali e legumi", group: "cibo", mark: "CL", description: "Riso, pasta, farine, legumi e derivati." },
  { id: "gastronomia-vegana", name: "Gastronomia vegana", group: "cibo", mark: "GV", description: "Piatti pronti e preparazioni esclusivamente vegetali." },
  { id: "pane-forno", name: "Pane e forno", group: "cibo", mark: "PF", description: "Pane, focacce, dolci e prodotti da forno vegani." },
  { id: "alternative-vegetali", name: "Alternative vegetali", group: "cibo", mark: "AV", description: "Tofu, seitan, tempeh e alternative vegetali." },
  { id: "dispensa", name: "Dispensa", group: "cibo", mark: "DI", description: "Conserve, spezie, condimenti e ingredienti vegani." },
  { id: "acqua", name: "Acqua", group: "bevande", mark: "AQ", description: "Acqua e sistemi di distribuzione o filtraggio." },
  { id: "bevande-analcoliche", name: "Bevande analcoliche", group: "bevande", mark: "BA", description: "Succhi, infusi freddi e bevande vegetali." },
  { id: "caffe-te", name: "Caffè, tè e infusi", group: "bevande", mark: "CT", description: "Bevande calde e materie prime." },
  { id: "casa-cucina", name: "Casa e cucina", group: "beni", mark: "CK", description: "Oggetti domestici, stoviglie e piccoli utensili." },
  { id: "abbigliamento", name: "Abbigliamento", group: "beni", mark: "AB", description: "Vestiti, scarpe e accessori." },
  { id: "elettronica", name: "Elettronica", group: "beni", mark: "EL", description: "Dispositivi, componenti e accessori tecnologici." },
  { id: "mobili", name: "Mobili", group: "beni", mark: "MO", description: "Arredi, illuminazione e organizzazione degli spazi." },
  { id: "attrezzi", name: "Attrezzi", group: "beni", mark: "AT", description: "Utensili da lavoro, riparazione e costruzione." },
  { id: "libri-cultura", name: "Libri e cultura", group: "beni", mark: "LC", description: "Libri, strumenti musicali e materiali culturali." },
  { id: "sport-tempo", name: "Sport e tempo libero", group: "beni", mark: "SP", description: "Attrezzature sportive e ricreative." },
  { id: "bambini", name: "Infanzia", group: "beni", mark: "IN", description: "Abbigliamento, giochi e beni per l'infanzia." },
  { id: "mobilita", name: "Mobilità", group: "beni", mark: "MB", description: "Biciclette, ricambi e accessori per muoversi." },
  { id: "igiene-cura", name: "Igiene e cura", group: "beni", mark: "IC", description: "Prodotti personali vegani e non testati su animali." },
  { id: "agricoltura", name: "Agricoltura e autoproduzione", group: "beni", mark: "AG", description: "Semi, vasi, sistemi di coltivazione e materiali." },
];

export const contributionAreas = [
  { id: "produzione", name: "Produrre o coltivare", description: "Mettere a disposizione capacità produttive." },
  { id: "preparazione", name: "Preparare cibo", description: "Cucinare o trasformare alimenti vegani." },
  { id: "riparazione", name: "Riparare e rigenerare", description: "Allungare la vita dei beni." },
  { id: "logistica", name: "Consegne e logistica", description: "Spostare beni nella rete territoriale." },
  { id: "catalogazione", name: "Catalogare e verificare", description: "Migliorare qualità e affidabilità dei dati." },
  { id: "organizzazione", name: "Organizzare", description: "Coordinare turni, gruppi e luoghi." },
  { id: "accoglienza", name: "Accogliere e orientare", description: "Aiutare le persone a usare il sistema." },
  { id: "sviluppo", name: "Sviluppare la piattaforma", description: "Progettazione, codice, ricerca e dati." },
];

export const cadenceOptions = [
  { value: "una-volta", label: "Una volta" },
  { value: "settimanale", label: "Ogni settimana" },
  { value: "mensile", label: "Ogni mese" },
  { value: "trimestrale", label: "Ogni tre mesi" },
  { value: "annuale", label: "Ogni anno" },
] as const;

export const units = ["pezzi", "kg", "g", "litri", "confezioni", "ore"] as const;

export function categoryById(id: string) {
  return categories.find((item) => item.id === id);
}

export function categoryName(id: string) {
  return categoryById(id)?.name ?? id;
}

export function isEdibleCategory(id: string) {
  const group = categoryById(id)?.group;
  return group === "cibo" || group === "bevande";
}

export function normalizeItem(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .slice(0, 120);
}
