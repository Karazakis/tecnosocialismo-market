"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import type { SuiteUser } from "@/lib/auth";
import {
  cadenceOptions,
  categories,
  categoryById,
  categoryName,
  contributionAreas,
  isEdibleCategory,
  type ProductGroup,
  units,
} from "@/lib/catalog";
import type {
  CapacityOffer,
  ConsumptionNeed,
  DemandEntry,
  EconomicProfile,
  Listing,
  ListingMode,
  MarketDashboard,
} from "@/lib/model";

const emptyDashboard: MarketDashboard = {
  configured: true,
  viewerId: null,
  profile: null,
  demand: [],
  supply: [],
  listings: [],
  requests: [],
  orders: [],
};

const suiteLinks = [
  { name: "Home", href: "https://tecnosocialismo.com", mark: "TS" },
  { name: "Rizoma", href: "https://rizoma.tecnosocialismo.com", mark: "RZ" },
  { name: "Iskra", href: "https://iskra.tecnosocialismo.com", mark: "IK" },
  { name: "Cloud", href: "https://cloud.tecnosocialismo.com", mark: "CL" },
  { name: "Mail", href: "https://mail.tecnosocialismo.com", mark: "ML" },
  { name: "Video", href: "https://video.tecnosocialismo.com", mark: "VD" },
  { name: "Musica", href: "https://musica.tecnosocialismo.com", mark: "MU" },
  { name: "Social", href: "https://social.tecnosocialismo.com", mark: "SO" },
  { name: "Messaggi", href: "https://messaggi.tecnosocialismo.com", mark: "MS" },
  { name: "Sport", href: "https://sport.tecnosocialismo.com", mark: "FT" },
  { name: "Market", href: "https://market.tecnosocialismo.com", mark: "MK" },
  { name: "Lavoro", href: "https://lavoro.tecnosocialismo.com", mark: "LW" },
  { name: "Azienda", href: "https://azienda.tecnosocialismo.com", mark: "AZ" },
  { name: "Servizi", href: "https://servizi.tecnosocialismo.com", mark: "SV" },
  { name: "Salute", href: "https://salute.tecnosocialismo.com", mark: "SA" },
  { name: "Educazione", href: "https://educazione.tecnosocialismo.com", mark: "ED" },
  { name: "Legge", href: "https://legge.tecnosocialismo.com", mark: "LE" },
  { name: "Burocrazia", href: "https://burocrazia.tecnosocialismo.com", mark: "BU" },
  { name: "Propaganda", href: "https://propaganda.tecnosocialismo.com", mark: "PR" },
  { name: "Biblioteca", href: "https://biblioteca.tecnosocialismo.com", mark: "BI" },
  { name: "Militant", href: "https://militant.tecnosocialismo.com", mark: "MT" },
  { name: "Account", href: "https://login.tecnosocialismo.com", mark: "AC" },
];

type Modal = "profile" | "listing" | "request" | null;
type ListingFilters = { group: "tutti" | ProductGroup; category: string; mode: "tutti" | ListingMode };

export function MarketApp({ user }: { user: SuiteUser | null }) {
  const [data, setData] = useState<MarketDashboard>(emptyDashboard);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<ListingFilters>({ group: "tutti", category: "tutte", mode: "tutti" });
  const [modal, setModal] = useState<Modal>(null);
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const loginUrl = `https://login.tecnosocialismo.com?returnTo=${encodeURIComponent("https://market.tecnosocialismo.com")}`;

  async function refresh() {
    const response = await fetch("/api/dashboard", { cache: "no-store" }).catch(() => null);
    if (response?.ok) setData((await response.json()) as MarketDashboard);
    setLoading(false);
  }

  useEffect(() => {
    let active = true;
    fetch("/api/dashboard", { cache: "no-store" })
      .then(async (response) => (response.ok ? ((await response.json()) as MarketDashboard) : null))
      .catch(() => null)
      .then((payload) => {
        if (!active) return;
        if (payload) setData(payload);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const activeModal = modal ?? (!loading && Boolean(user) && !data.profile ? "profile" : null);
  const visibleListings = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("it");
    return data.listings.filter((listing) => {
      const matchesQuery =
        !needle ||
        [listing.title, listing.item, listing.description, listing.city, categoryName(listing.category)]
          .join(" ")
          .toLocaleLowerCase("it")
          .includes(needle);
      return (
        matchesQuery &&
        (filters.group === "tutti" || listing.group === filters.group) &&
        (filters.category === "tutte" || listing.category === filters.category) &&
        (filters.mode === "tutti" || listing.mode === filters.mode)
      );
    });
  }, [data.listings, filters, query]);

  function toast(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 3600);
  }

  function requireAccount(next: Exclude<Modal, null>) {
    if (!user) {
      window.location.assign(loginUrl);
      return;
    }
    if (next !== "profile" && !data.profile) {
      setModal("profile");
      toast("Definiamo prima bisogni, capacità e forme di contributo.");
      return;
    }
    setModal(next);
  }

  async function act(body: Record<string, unknown>, success: string) {
    setBusy(true);
    const response = await fetch("/api/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    const payload = response ? ((await response.json().catch(() => ({}))) as { error?: string }) : {};
    setBusy(false);
    if (!response?.ok) {
      toast(payload.error || "Operazione non riuscita.");
      return false;
    }
    await refresh();
    toast(success);
    return true;
  }

  async function saveProfile(profile: ProfileDraft) {
    const saved = await act(
      { action: "save-profile", ...profile },
      "Profilo economico aggiornato. La tua domanda e la tua capacità ora entrano nel calcolo collettivo.",
    );
    if (saved) setModal(null);
  }

  async function createListing(payload: Record<string, unknown>) {
    const saved = await act({ action: "create-listing", ...payload }, "Bene messo in circolo nel Market.");
    if (saved) setModal(null);
  }

  async function requestListing(payload: Record<string, unknown>) {
    if (!selectedListing) return;
    const saved = await act(
      { action: "request-listing", id: selectedListing.id, ...payload },
      "Richiesta inviata. Il bene è stato riservato e la consegna può entrare nella logistica interna.",
    );
    if (saved) {
      setModal(null);
      setSelectedListing(null);
    }
  }

  function openRequest(listing: Listing) {
    if (!user) {
      window.location.assign(loginUrl);
      return;
    }
    if (!data.profile) {
      setModal("profile");
      return;
    }
    setSelectedListing(listing);
    setModal("request");
  }

  const demandPeople = Math.max(0, ...data.demand.map((entry) => entry.people));
  const ownNeeds = new Set(data.profile?.needs.map((need) => `${need.category}|${normalizeForClient(need.item)}`) ?? []);

  return (
    <div className="market-shell">
      <header className="topbar">
        <a className="ts-brand" href="https://tecnosocialismo.com" aria-label="Tecnosocialismo">
          <i />
          <span>
            TECNO
            <br />
            SOCIALISMO
          </span>
        </a>
        <Link className="market-brand" href="/">
          <b>MK</b>
          <span>
            Market
            <small>DOMANDA COLLETTIVA</small>
          </span>
        </Link>
        <label className="top-search">
          <span>⌕</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cerca un bene, un alimento, una città"
            aria-label="Cerca nel Market"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="Cancella ricerca">
              ×
            </button>
          )}
        </label>
        <nav className="top-actions">
          <button className="suite-trigger" type="button" onClick={() => setMenuOpen((value) => !value)}>
            Servizi <span>⌄</span>
          </button>
          <button className="ghost-action" type="button" onClick={() => requireAccount("profile")}>
            Il mio profilo
          </button>
          <a className={user ? "account-pill signed" : "account-pill"} href={user ? loginUrl : loginUrl}>
            {user ? initials(user.name) : "Accedi"}
          </a>
        </nav>
        {menuOpen && (
          <div className="suite-menu">
            <header>
              <span>ECOSISTEMA</span>
              <button type="button" onClick={() => setMenuOpen(false)}>
                ×
              </button>
            </header>
            <div>
              {suiteLinks.map((link) => (
                <a href={link.href} key={link.name}>
                  <i>{link.mark}</i>
                  <span>{link.name}</span>
                  <b>↗</b>
                </a>
              ))}
            </div>
          </div>
        )}
      </header>

      <aside className="sidebar">
        <section className="side-intro">
          <span>MARKET / 01</span>
          <p>Beni e alimenti organizzati a partire da ciò che serve davvero.</p>
        </section>
        <nav className="group-nav" aria-label="Ambiti del Market">
          {[
            ["tutti", "Tutto", "00"],
            ["cibo", "Cibo vegano", "01"],
            ["bevande", "Bevande", "02"],
            ["beni", "Beni", "03"],
          ].map(([value, label, mark]) => (
            <button
              type="button"
              className={filters.group === value ? "active" : ""}
              onClick={() => setFilters((current) => ({ ...current, group: value as ListingFilters["group"], category: "tutte" }))}
              key={value}
            >
              <i>{mark}</i>
              <span>{label}</span>
              <b>→</b>
            </button>
          ))}
        </nav>
        <section className="collective-pulse">
          <header>
            <span>DOMANDA ATTIVA</span>
            <i />
          </header>
          <b>{data.demand.length}</b>
          <small>bisogni specifici rilevati</small>
          <div className="pulse-bars">
            {data.demand.slice(0, 5).map((entry) => (
              <i
                style={{ width: `${Math.max(16, (entry.people / Math.max(1, demandPeople)) * 100)}%` }}
                key={entry.key}
              />
            ))}
          </div>
          <button type="button" onClick={() => requireAccount("profile")}>
            {data.profile ? "Aggiorna il profilo" : "Definisci i tuoi bisogni"}
          </button>
        </section>
        <a className="manifesto-link" href="https://tecnosocialismo.com/manifesto">
          <span>PRINCIPIO</span>
          <b>Prima il bisogno.<br />Poi l’offerta.</b>
          <i>↗</i>
        </a>
      </aside>

      <main className="main-content">
        <section className="hero">
          <div className="hero-copy">
            <p>
              MARKET TECNOSOCIALISTA <i />
            </p>
            <h1>
              Ciò che serve,
              <span>messo in circolo.</span>
            </h1>
            <div className="hero-lead">
              <span>01</span>
              <p>
                Il Market non inventa bisogni: raccoglie la domanda reale, rende visibili le capacità e abilita
                dono, scambio o compravendita solo per ciò che è stato richiesto.
              </p>
            </div>
            <div className="hero-actions">
              <button type="button" onClick={() => requireAccount("listing")}>
                Metti in circolo <span>→</span>
              </button>
              <button type="button" className="secondary" onClick={() => requireAccount("profile")}>
                Definisci domanda e capacità
              </button>
            </div>
          </div>
          <div className="demand-orbit" aria-hidden="true">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="orbit orbit-three" />
            <div className="orbit-core">
              <i />
              <span>{data.demand.length || "—"}</span>
              <small>BISOGNI<br />SPECIFICI</small>
            </div>
            <span className="orbit-label label-one">DOMANDA</span>
            <span className="orbit-label label-two">CAPACITÀ</span>
            <span className="orbit-label label-three">DISTRIBUZIONE</span>
          </div>
        </section>

        {!data.configured && (
          <div className="system-warning">
            Il Market è pronto, ma il suo archivio deve ancora essere collegato prima di salvare dati.
          </div>
        )}

        <section className="principles-grid">
          <article>
            <span>01 / DOMANDA</span>
            <b>Solo ciò che è richiesto</b>
            <p>Ogni bene pubblicabile deve corrispondere a un bisogno specifico espresso nella rete.</p>
          </article>
          <article>
            <span>02 / ALIMENTAZIONE</span>
            <b>Il cibo è solo vegano</b>
            <p>Nessun alimento o bevanda di origine animale può entrare nel catalogo.</p>
          </article>
          <article className="social-value-card">
            <span>03 / VALORE SOCIALE</span>
            <b>Punti in preparazione <i>LOCK</i></b>
            <p>Il prezzo capitalista resta sempre visibile. I punti sociali verranno attivati dopo la definizione collettiva delle regole.</p>
          </article>
        </section>

        <section className="demand-section">
          <SectionHeader
            eyebrow="OSSERVATORIO DEL BISOGNO"
            title="La domanda, prima del catalogo"
            copy="Dati aggregati e anonimi: mostrano cosa serve, con quale frequenza e con quale priorità."
            action={data.profile ? "Modifica le mie risposte" : "Partecipa al calcolo"}
            onAction={() => requireAccount("profile")}
          />
          {data.demand.length ? (
            <div className="demand-grid">
              {data.demand.slice(0, 8).map((entry, index) => (
                <DemandCard
                  entry={entry}
                  rank={index + 1}
                  active={filters.category === entry.category}
                  onClick={() =>
                    setFilters({
                      group: categoryById(entry.category)?.group ?? "tutti",
                      category: filters.category === entry.category ? "tutte" : entry.category,
                      mode: filters.mode,
                    })
                  }
                  key={entry.key}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              mark="DB"
              title="La domanda collettiva parte da te"
              text="Accedi e descrivi in modo specifico ciò che vuoi consumare, ciò che sai fare e come puoi contribuire."
              action="Compila il profilo"
              onAction={() => requireAccount("profile")}
            />
          )}
        </section>

        <section className="catalog-section">
          <SectionHeader
            eyebrow="BENI IN CIRCOLAZIONE"
            title="Disponibili nella rete"
            copy="Il valore di mercato capitalista è sempre dichiarato, anche quando un bene viene donato o scambiato."
            action="Aggiungi un bene"
            onAction={() => requireAccount("listing")}
          />
          <div className="filter-row">
            <div>
              {(["tutti", "dono", "scambio", "vendita"] as const).map((mode) => (
                <button
                  type="button"
                  className={filters.mode === mode ? "active" : ""}
                  onClick={() => setFilters((current) => ({ ...current, mode }))}
                  key={mode}
                >
                  {mode === "tutti" ? "Tutti" : mode}
                </button>
              ))}
            </div>
            <span>
              {visibleListings.length} {visibleListings.length === 1 ? "risultato" : "risultati"}
            </span>
          </div>
          {loading ? (
            <div className="loading-grid">
              <i />
              <i />
              <i />
            </div>
          ) : visibleListings.length ? (
            <div className="listing-grid">
              {visibleListings.map((listing) => (
                <ListingCard
                  listing={listing}
                  viewerId={data.viewerId}
                  personallyRequested={ownNeeds.has(`${listing.category}|${normalizeForClient(listing.item)}`)}
                  onRequest={() =>
                    ownNeeds.has(`${listing.category}|${normalizeForClient(listing.item)}`)
                      ? openRequest(listing)
                      : requireAccount("profile")
                  }
                  key={listing.id}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              mark="MK"
              title={data.listings.length ? "Nessun bene con questi filtri" : "Il catalogo nascerà dai bisogni reali"}
              text={
                data.listings.length
                  ? "Prova a cambiare ricerca, ambito o modalità."
                  : "Quando un bisogno compare nella domanda collettiva, chi può soddisfarlo potrà mettere il bene in circolo."
              }
              action={data.listings.length ? "Azzera i filtri" : "Metti in circolo"}
              onAction={() =>
                data.listings.length
                  ? setFilters({ group: "tutti", category: "tutte", mode: "tutti" })
                  : requireAccount("listing")
              }
            />
          )}
        </section>
      </main>

      <footer className="site-footer">
        <a className="ts-brand" href="https://tecnosocialismo.com">
          <i />
          <span>TECNOSOCIALISMO</span>
        </a>
        <p>Il Market organizza beni, cibo vegano e bevande a partire dalla domanda espressa.</p>
        <div>
          <a href="https://tecnosocialismo.com/manifesto">Manifesto</a>
          <a href="https://login.tecnosocialismo.com">Account</a>
          <a href="https://messaggi.tecnosocialismo.com">Messaggi</a>
        </div>
      </footer>

      {activeModal === "profile" && (
        <ProfileWizard
          profile={data.profile}
          busy={busy}
          dismissible={Boolean(data.profile)}
          onClose={() => setModal(null)}
          onSave={saveProfile}
        />
      )}
      {activeModal === "listing" && (
        <ListingModal demand={data.demand} profile={data.profile} busy={busy} onClose={() => setModal(null)} onSave={createListing} />
      )}
      {activeModal === "request" && selectedListing && (
        <RequestModal listing={selectedListing} busy={busy} onClose={() => setModal(null)} onSave={requestListing} />
      )}
      {notice && (
        <div className="toast">
          <i />
          <span>{notice}</span>
        </div>
      )}
    </div>
  );
}

function SectionHeader({
  eyebrow,
  title,
  copy,
  action,
  onAction,
}: {
  eyebrow: string;
  title: string;
  copy: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <header className="section-header">
      <div>
        <span>{eyebrow}</span>
        <h2>{title}</h2>
      </div>
      <p>{copy}</p>
      {action && onAction && (
        <button type="button" onClick={onAction}>
          {action} <b>→</b>
        </button>
      )}
    </header>
  );
}

function DemandCard({ entry, rank, active, onClick }: { entry: DemandEntry; rank: number; active: boolean; onClick: () => void }) {
  const cadence = cadenceOptions.find((item) => item.value === entry.cadence)?.label ?? entry.cadence;
  return (
    <button type="button" className={`demand-card ${active ? "active" : ""}`} onClick={onClick}>
      <header>
        <i>{String(rank).padStart(2, "0")}</i>
        <span>{categoryName(entry.category)}</span>
        <b>{entry.essentialCount ? "ESSENZIALE" : "RICHIESTO"}</b>
      </header>
      <h3>{entry.item}</h3>
      <div className="demand-metrics">
        <span>
          <b>{formatNumber(entry.totalQuantity)}</b>
          <small>{entry.unit} / {cadence.toLocaleLowerCase("it")}</small>
        </span>
        <span>
          <b>{entry.people}</b>
          <small>{entry.people === 1 ? "persona" : "persone"}</small>
        </span>
      </div>
      <footer>
        <span style={{ width: `${Math.min(100, 24 + entry.people * 12)}%` }} />
      </footer>
    </button>
  );
}

function ListingCard({
  listing,
  viewerId,
  personallyRequested,
  onRequest,
}: {
  listing: Listing;
  viewerId: string | null;
  personallyRequested: boolean;
  onRequest: () => void;
}) {
  const own = listing.ownerId === viewerId;
  const category = categoryById(listing.category);
  return (
    <article className="listing-card">
      <div className={`listing-visual group-${listing.group}`}>
        <header>
          <span>{category?.mark ?? "MK"}</span>
          <b>{listing.mode}</b>
        </header>
        <i className="visual-ring ring-one" />
        <i className="visual-ring ring-two" />
        <strong>{listing.item.slice(0, 2).toLocaleUpperCase("it")}</strong>
        {listing.vegan && <em>100% VEGANO</em>}
      </div>
      <section>
        <small>{category?.name} · {listing.condition} · {listing.city}</small>
        <h3>{listing.title}</h3>
        <p>{listing.description}</p>
        <div className="price-stack">
          <span>
            <small>PREZZO MERCATO CAPITALISTA</small>
            <b>€ {formatMoney(listing.marketPrice)}</b>
          </span>
          {listing.mode === "vendita" && (
            <span className="asking">
              <small>PREZZO RICHIESTO</small>
              <b>€ {formatMoney(listing.askingPrice ?? 0)}</b>
            </span>
          )}
          {listing.mode === "dono" && <span className="mode-value">DONO</span>}
          {listing.mode === "scambio" && <span className="mode-value">⇄ {listing.exchangeFor || "Proposta libera"}</span>}
        </div>
        <div className="social-value-lock">
          <i>SV</i>
          <span>
            <b>Punti di valore sociale</b>
            <small>Acquisizione e pagamento non ancora attivi</small>
          </span>
          <em>LOCK</em>
        </div>
      </section>
      <footer>
        <span>
          <i>{initials(listing.ownerName)}</i>
          <b>{listing.ownerName}</b>
        </span>
        <button type="button" disabled={own || listing.status !== "disponibile"} onClick={onRequest}>
          {own ? "È tuo" : listing.status !== "disponibile" ? "Riservato" : personallyRequested ? "Richiedi →" : "Aggiungi ai bisogni"}
        </button>
      </footer>
    </article>
  );
}

function EmptyState({
  mark,
  title,
  text,
  action,
  onAction,
}: {
  mark: string;
  title: string;
  text: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <div className="empty-state">
      <i>{mark}</i>
      <div>
        <h3>{title}</h3>
        <p>{text}</p>
      </div>
      <button type="button" onClick={onAction}>
        {action} <span>→</span>
      </button>
    </div>
  );
}

type ProfileDraft = {
  city: string;
  postalCode: string;
  householdSize: number;
  radiusKm: number;
  needs: ConsumptionNeed[];
  capacities: CapacityOffer[];
  contributionAreas: string[];
  contributionHours: number;
  availability: string;
  mobility: EconomicProfile["mobility"];
  canDeliver: boolean;
  learningInterests: string[];
};

function ProfileWizard({
  profile,
  busy,
  dismissible,
  onClose,
  onSave,
}: {
  profile: EconomicProfile | null;
  busy: boolean;
  dismissible: boolean;
  onClose: () => void;
  onSave: (profile: ProfileDraft) => Promise<void>;
}) {
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<ProfileDraft>(() => profileDraft(profile));
  const [learning, setLearning] = useState(profile?.learningInterests.join(", ") ?? "");

  function updateNeed(id: string, key: keyof ConsumptionNeed, value: string | number) {
    setDraft((current) => ({
      ...current,
      needs: current.needs.map((need) => (need.id === id ? { ...need, [key]: value } : need)),
    }));
  }

  function updateCapacity(id: string, key: keyof CapacityOffer, value: string | number) {
    setDraft((current) => ({
      ...current,
      capacities: current.capacities.map((capacity) => (capacity.id === id ? { ...capacity, [key]: value } : capacity)),
    }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step < 5) {
      setStep((current) => current + 1);
      return;
    }
    await onSave({
      ...draft,
      learningInterests: learning.split(",").map((item) => item.trim()).filter(Boolean),
    });
  }

  const stepCopy = [
    ["Territorio", "Dove e per quante persone"],
    ["Domanda", "Cosa vuoi consumare"],
    ["Capacità", "Cosa puoi fare o produrre"],
    ["Contributo", "Come puoi partecipare"],
    ["Sintesi", "Il tuo profilo economico"],
  ];

  return (
    <div className="modal-layer">
      <form className="profile-modal" onSubmit={submit}>
        <aside className="wizard-aside">
          <Link className="market-brand" href="/">
            <b>MK</b>
            <span>
              Market
              <small>PROFILO ECONOMICO</small>
            </span>
          </Link>
          <div className="wizard-title">
            <span>CALCOLO COLLETTIVO</span>
            <h2>Bisogni reali.<br />Possibilità reali.</h2>
            <p>
              Queste informazioni permettono di stimare domanda, capacità produttiva e forme possibili di
              distribuzione del valore.
            </p>
          </div>
          <ol>
            {stepCopy.map(([title, copy], index) => (
              <li className={step === index + 1 ? "active" : step > index + 1 ? "done" : ""} key={title}>
                <i>{step > index + 1 ? "✓" : String(index + 1).padStart(2, "0")}</i>
                <span>
                  <b>{title}</b>
                  <small>{copy}</small>
                </span>
              </li>
            ))}
          </ol>
          <small className="privacy-note">
            I dati individuali non vengono pubblicati. Nel Market appare solo la loro aggregazione.
          </small>
        </aside>
        <section className="wizard-main">
          <header>
            <div>
              <span>PASSO {String(step).padStart(2, "0")} / 05</span>
              <b>{stepCopy[step - 1][0]}</b>
            </div>
            {dismissible && (
              <button type="button" onClick={onClose} aria-label="Chiudi">
                ×
              </button>
            )}
          </header>

          {step === 1 && (
            <div className="wizard-panel">
              <PanelIntro
                title="Partiamo dal territorio"
                text="Il bisogno cambia con il luogo, la dimensione del nucleo e la distanza sostenibile per scambi e consegne."
              />
              <div className="field-grid two">
                <Field label="Città o comune">
                  <input value={draft.city} onChange={(event) => setDraft({ ...draft, city: event.target.value })} required />
                </Field>
                <Field label="CAP">
                  <input
                    value={draft.postalCode}
                    onChange={(event) => setDraft({ ...draft, postalCode: event.target.value })}
                    inputMode="numeric"
                    required
                  />
                </Field>
                <Field label="Persone nel nucleo">
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={draft.householdSize}
                    onChange={(event) => setDraft({ ...draft, householdSize: Number(event.target.value) })}
                    required
                  />
                </Field>
                <Field label="Raggio territoriale">
                  <div className="range-field">
                    <input
                      type="range"
                      min="1"
                      max="100"
                      value={draft.radiusKm}
                      onChange={(event) => setDraft({ ...draft, radiusKm: Number(event.target.value) })}
                    />
                    <b>{draft.radiusKm} km</b>
                  </div>
                </Field>
              </div>
              <div className="info-band">
                <i>i</i>
                <p>Il raggio serve a costruire reti locali efficienti; non limita l’accesso al resto del Market.</p>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="wizard-panel">
              <PanelIntro
                title="Cosa vuoi consumare?"
                text="Non categorie generiche: indica beni precisi, quantità, frequenza e priorità. È da qui che nasce la domanda collettiva."
              />
              <div className="repeat-list">
                {draft.needs.map((need, index) => (
                  <article className="repeat-card" key={need.id}>
                    <header>
                      <span>BISOGNO {String(index + 1).padStart(2, "0")}</span>
                      {draft.needs.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setDraft({ ...draft, needs: draft.needs.filter((item) => item.id !== need.id) })}
                        >
                          Rimuovi
                        </button>
                      )}
                    </header>
                    <div className="field-grid need-grid">
                      <Field label="Ambito">
                        <select value={need.category} onChange={(event) => updateNeed(need.id, "category", event.target.value)}>
                          {groupedCategoryOptions()}
                        </select>
                      </Field>
                      <Field label="Bene specifico">
                        <input
                          value={need.item}
                          onChange={(event) => updateNeed(need.id, "item", event.target.value)}
                          placeholder="es. Lenticchie rosse"
                          required
                        />
                      </Field>
                      <Field label="Quantità">
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={need.quantity}
                          onChange={(event) => updateNeed(need.id, "quantity", Number(event.target.value))}
                          required
                        />
                      </Field>
                      <Field label="Unità">
                        <select value={need.unit} onChange={(event) => updateNeed(need.id, "unit", event.target.value)}>
                          {units.map((unit) => <option key={unit}>{unit}</option>)}
                        </select>
                      </Field>
                      <Field label="Frequenza">
                        <select value={need.cadence} onChange={(event) => updateNeed(need.id, "cadence", event.target.value)}>
                          {cadenceOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
                        </select>
                      </Field>
                      <Field label="Priorità">
                        <select value={need.priority} onChange={(event) => updateNeed(need.id, "priority", event.target.value)}>
                          <option value="essenziale">Essenziale</option>
                          <option value="importante">Importante</option>
                          <option value="utile">Utile</option>
                        </select>
                      </Field>
                      <Field label="Alternative accettabili" wide>
                        <input
                          value={need.alternatives}
                          onChange={(event) => updateNeed(need.id, "alternatives", event.target.value)}
                          placeholder="es. ceci o fagioli, purché secchi"
                        />
                      </Field>
                      <Field label="Vincoli o note" wide>
                        <input
                          value={need.notes}
                          onChange={(event) => updateNeed(need.id, "notes", event.target.value)}
                          placeholder="Allergie, misure, caratteristiche indispensabili…"
                        />
                      </Field>
                    </div>
                    {isEdibleCategory(need.category) && (
                      <div className="vegan-rule">
                        <i>V</i>
                        <span>
                          <b>Solo vegano</b>
                          <small>Per cibo e bevande il vincolo è automatico e non modificabile.</small>
                        </span>
                      </div>
                    )}
                  </article>
                ))}
              </div>
              <button
                className="add-repeat"
                type="button"
                onClick={() => setDraft({ ...draft, needs: [...draft.needs, newNeed()] })}
              >
                + Aggiungi un altro bisogno specifico
              </button>
            </div>
          )}

          {step === 3 && (
            <div className="wizard-panel">
              <PanelIntro
                title="Cosa puoi fare o produrre?"
                text="Descrivi capacità concrete, anche piccole o occasionali. Non è una promessa: serve a misurare le possibilità reali della rete."
              />
              {draft.capacities.length ? (
                <div className="repeat-list">
                  {draft.capacities.map((capacity, index) => (
                    <article className="repeat-card" key={capacity.id}>
                      <header>
                        <span>CAPACITÀ {String(index + 1).padStart(2, "0")}</span>
                        <button
                          type="button"
                          onClick={() =>
                            setDraft({ ...draft, capacities: draft.capacities.filter((item) => item.id !== capacity.id) })
                          }
                        >
                          Rimuovi
                        </button>
                      </header>
                      <div className="field-grid need-grid">
                        <Field label="Ambito">
                          <select
                            value={capacity.category}
                            onChange={(event) => updateCapacity(capacity.id, "category", event.target.value)}
                          >
                            {groupedCategoryOptions()}
                          </select>
                        </Field>
                        <Field label="Attività o risultato">
                          <input
                            value={capacity.activity}
                            onChange={(event) => updateCapacity(capacity.id, "activity", event.target.value)}
                            placeholder="es. Riparare biciclette"
                            required
                          />
                        </Field>
                        <Field label="Capacità">
                          <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={capacity.capacity}
                            onChange={(event) => updateCapacity(capacity.id, "capacity", Number(event.target.value))}
                          />
                        </Field>
                        <Field label="Unità">
                          <select
                            value={capacity.unit}
                            onChange={(event) => updateCapacity(capacity.id, "unit", event.target.value)}
                          >
                            {units.map((unit) => <option key={unit}>{unit}</option>)}
                          </select>
                        </Field>
                        <Field label="Frequenza">
                          <select
                            value={capacity.cadence}
                            onChange={(event) => updateCapacity(capacity.id, "cadence", event.target.value)}
                          >
                            {cadenceOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
                          </select>
                        </Field>
                        <Field label="Esperienza">
                          <select
                            value={capacity.experience}
                            onChange={(event) => updateCapacity(capacity.id, "experience", event.target.value)}
                          >
                            <option value="iniziale">Iniziale</option>
                            <option value="autonoma">Autonoma</option>
                            <option value="esperta">Esperta</option>
                          </select>
                        </Field>
                        <Field label="Strumenti o risorse disponibili" wide>
                          <input
                            value={capacity.resources}
                            onChange={(event) => updateCapacity(capacity.id, "resources", event.target.value)}
                            placeholder="Spazio, strumenti, mezzo, laboratorio…"
                          />
                        </Field>
                        <Field label="Quando" wide>
                          <input
                            value={capacity.availability}
                            onChange={(event) => updateCapacity(capacity.id, "availability", event.target.value)}
                            placeholder="es. sabato mattina, due sere al mese"
                          />
                        </Field>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="honest-zero">
                  <i>0</i>
                  <span>
                    <b>Puoi anche non indicare capacità produttive.</b>
                    <p>Il sistema deve rappresentare possibilità reali, non imporre una disponibilità che non c’è.</p>
                  </span>
                </div>
              )}
              <button
                className="add-repeat"
                type="button"
                onClick={() => setDraft({ ...draft, capacities: [...draft.capacities, newCapacity()] })}
              >
                + Aggiungi una capacità
              </button>
            </div>
          )}

          {step === 4 && (
            <div className="wizard-panel">
              <PanelIntro
                title="Come vuoi contribuire?"
                text="La produzione è solo una parte. Logistica, manutenzione, organizzazione e conoscenza fanno funzionare l’intero sistema."
              />
              <div className="contribution-grid">
                {contributionAreas.map((area) => {
                  const selected = draft.contributionAreas.includes(area.id);
                  return (
                    <button
                      type="button"
                      className={selected ? "selected" : ""}
                      onClick={() =>
                        setDraft({
                          ...draft,
                          contributionAreas: selected
                            ? draft.contributionAreas.filter((id) => id !== area.id)
                            : [...draft.contributionAreas, area.id],
                        })
                      }
                      key={area.id}
                    >
                      <i>{selected ? "✓" : "+"}</i>
                      <span>
                        <b>{area.name}</b>
                        <small>{area.description}</small>
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="field-grid two contribution-fields">
                <Field label="Ore indicative a settimana">
                  <input
                    type="number"
                    min="0"
                    max="80"
                    value={draft.contributionHours}
                    onChange={(event) => setDraft({ ...draft, contributionHours: Number(event.target.value) })}
                  />
                </Field>
                <Field label="Mobilità disponibile">
                  <select
                    value={draft.mobility}
                    onChange={(event) => setDraft({ ...draft, mobility: event.target.value as EconomicProfile["mobility"] })}
                  >
                    <option value="nessuna">Nessun mezzo</option>
                    <option value="piedi-bici">A piedi o bicicletta</option>
                    <option value="mezzo-leggero">Scooter o cargo bike</option>
                    <option value="auto-furgone">Auto o furgone</option>
                  </select>
                </Field>
                <Field label="Disponibilità concreta" wide>
                  <input
                    value={draft.availability}
                    onChange={(event) => setDraft({ ...draft, availability: event.target.value })}
                    placeholder="Giorni, orari o limiti da rispettare"
                  />
                </Field>
                <Field label="Cosa vorresti imparare" wide>
                  <input
                    value={learning}
                    onChange={(event) => setLearning(event.target.value)}
                    placeholder="Separa più interessi con una virgola"
                  />
                </Field>
              </div>
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={draft.canDeliver}
                  onChange={(event) => setDraft({ ...draft, canDeliver: event.target.checked })}
                />
                <i />
                <span>
                  <b>Posso contribuire alle consegne interne</b>
                  <small>La disponibilità sarà usata in seguito dal portale Lavoro, mai assegnata automaticamente.</small>
                </span>
              </label>
            </div>
          )}

          {step === 5 && (
            <div className="wizard-panel">
              <PanelIntro
                title="Una fotografia economica, non un profilo commerciale"
                text="Puoi modificare tutto in qualsiasi momento. Il calcolo collettivo si aggiornerà insieme ai bisogni e alle possibilità."
              />
              <div className="summary-grid">
                <article>
                  <span>TERRITORIO</span>
                  <b>{draft.city || "Da indicare"}</b>
                  <p>{draft.householdSize} persone · raggio {draft.radiusKm} km</p>
                </article>
                <article>
                  <span>DOMANDA</span>
                  <b>{draft.needs.length} bisogni specifici</b>
                  <p>{draft.needs.filter((need) => need.priority === "essenziale").length} indicati come essenziali</p>
                </article>
                <article>
                  <span>CAPACITÀ</span>
                  <b>{draft.capacities.length} possibilità</b>
                  <p>{draft.capacities.length ? "Entreranno nel quadro dell’offerta" : "Nessuna disponibilità dichiarata"}</p>
                </article>
                <article>
                  <span>CONTRIBUTO</span>
                  <b>{draft.contributionHours} ore / settimana</b>
                  <p>{draft.contributionAreas.length} ambiti selezionati</p>
                </article>
              </div>
              <div className="calculation-preview">
                <header>
                  <i>SV</i>
                  <span>
                    <b>Base per il futuro valore sociale</b>
                    <small>Il profilo registra bisogni e possibilità, ma non assegna ancora punti.</small>
                  </span>
                  <em>NON ATTIVO</em>
                </header>
                <div>
                  <span>Bisogni individuali</span><i>→</i><span>Domanda aggregata</span><i>→</i><span>Capacità reale</span><i>→</i><span>Distribuzione del valore</span>
                </div>
              </div>
            </div>
          )}

          <footer className="wizard-footer">
            <span>
              <i style={{ width: `${step * 20}%` }} />
            </span>
            <div>
              {step > 1 && (
                <button type="button" className="back" onClick={() => setStep((current) => current - 1)}>
                  ← Indietro
                </button>
              )}
              <button type="submit" className="next" disabled={busy}>
                {busy ? "Salvataggio…" : step === 5 ? "Salva il profilo" : "Continua"} <span>→</span>
              </button>
            </div>
          </footer>
        </section>
      </form>
    </div>
  );
}

function ListingModal({
  demand,
  profile,
  busy,
  onClose,
  onSave,
}: {
  demand: DemandEntry[];
  profile: EconomicProfile | null;
  busy: boolean;
  onClose: () => void;
  onSave: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const uniqueDemand = useMemo(() => {
    const seen = new Set<string>();
    return demand.filter((entry) => {
      const key = `${entry.category}|${normalizeForClient(entry.item)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [demand]);
  const [demandKey, setDemandKey] = useState(uniqueDemand[0]?.key ?? "");
  const [mode, setMode] = useState<ListingMode>("dono");
  const selected = uniqueDemand.find((entry) => entry.key === demandKey) ?? uniqueDemand[0];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = new FormData(event.currentTarget);
    await onSave({
      category: selected.category,
      item: selected.item,
      title: form.get("title"),
      description: form.get("description"),
      quantity: form.get("quantity"),
      unit: form.get("unit"),
      condition: form.get("condition"),
      mode,
      vegan: isEdibleCategory(selected.category) || form.get("vegan") === "on",
      marketPrice: form.get("marketPrice"),
      askingPrice: form.get("askingPrice"),
      exchangeFor: form.get("exchangeFor"),
      city: form.get("city"),
      pickup: form.get("pickup") === "on",
      internalDelivery: form.get("internalDelivery") === "on",
    });
  }

  return (
    <div className="modal-layer compact">
      <form className="action-modal" onSubmit={submit}>
        <header>
          <div>
            <span>NUOVO BENE</span>
            <h2>Metti in circolo ciò che è richiesto</h2>
          </div>
          <button type="button" onClick={onClose}>×</button>
        </header>
        {!uniqueDemand.length ? (
          <div className="modal-empty">
            <i>DB</i>
            <h3>La domanda è ancora vuota</h3>
            <p>Prima una persona deve indicare un bisogno specifico nel proprio profilo economico.</p>
            <button type="button" onClick={onClose}>Torna al Market</button>
          </div>
        ) : (
          <>
            <div className="modal-body">
              <div className="rule-strip">
                <i>01</i>
                <span>
                  <b>Il bene deve esistere nella domanda collettiva</b>
                  <small>Per questo puoi selezionarlo solo dall’elenco dei bisogni già espressi.</small>
                </span>
              </div>
              <Field label="Bene richiesto">
                <select value={demandKey} onChange={(event) => setDemandKey(event.target.value)}>
                  {uniqueDemand.map((entry) => (
                    <option value={entry.key} key={entry.key}>
                      {entry.item} · {categoryName(entry.category)} · {entry.people} {entry.people === 1 ? "persona" : "persone"}
                    </option>
                  ))}
                </select>
              </Field>
              {selected && isEdibleCategory(selected.category) && (
                <div className="vegan-rule">
                  <i>V</i>
                  <span>
                    <b>Certificazione dichiarativa vegana obbligatoria</b>
                    <small>Pubblicando confermi l’assenza di ingredienti e componenti di origine animale.</small>
                  </span>
                </div>
              )}
              <div className="field-grid two">
                <Field label="Titolo">
                  <input name="title" placeholder="Descrizione breve e chiara" required />
                </Field>
                <Field label="Condizione">
                  <input name="condition" placeholder={selected && isEdibleCategory(selected.category) ? "Fresco, scadenza…" : "Nuovo, ottimo, da riparare…"} required />
                </Field>
                <Field label="Quantità">
                  <input name="quantity" type="number" min="0.01" step="0.01" defaultValue="1" required />
                </Field>
                <Field label="Unità">
                  <select name="unit" defaultValue={selected?.unit ?? "pezzi"}>
                    {units.map((unit) => <option key={unit}>{unit}</option>)}
                  </select>
                </Field>
                <Field label="Descrizione" wide>
                  <textarea name="description" rows={3} placeholder="Stato, provenienza, caratteristiche e tutto ciò che serve sapere." required />
                </Field>
              </div>
              <fieldset className="mode-picker">
                <legend>Come lo metti in circolo?</legend>
                {(["dono", "scambio", "vendita"] as const).map((item) => (
                  <button type="button" className={mode === item ? "active" : ""} onClick={() => setMode(item)} key={item}>
                    <i>{item === "dono" ? "●" : item === "scambio" ? "⇄" : "€"}</i>
                    <span>
                      <b>{item}</b>
                      <small>{item === "dono" ? "Senza corrispettivo" : item === "scambio" ? "Con un altro bene" : "Con prezzo richiesto"}</small>
                    </span>
                  </button>
                ))}
              </fieldset>
              <div className="field-grid two">
                <Field label="Prezzo del mercato capitalista">
                  <div className="money-input"><span>€</span><input name="marketPrice" type="number" min="0.01" step="0.01" required /></div>
                </Field>
                {mode === "vendita" && (
                  <Field label="Prezzo richiesto">
                    <div className="money-input"><span>€</span><input name="askingPrice" type="number" min="0.01" step="0.01" required /></div>
                  </Field>
                )}
                {mode === "scambio" && (
                  <Field label="Cosa accetteresti">
                    <input name="exchangeFor" placeholder="Bene o proposta equivalente" />
                  </Field>
                )}
                <Field label="Città">
                  <input name="city" defaultValue={profile?.city ?? ""} required />
                </Field>
              </div>
              <div className="price-explainer">
                <i>€</i>
                <p><b>Il prezzo capitalista è sempre visibile.</b> Serve come riferimento trasparente anche per doni e scambi; non determina il futuro valore sociale.</p>
              </div>
              <div className="checkbox-pair">
                <label><input name="pickup" type="checkbox" defaultChecked /><i />Ritiro diretto disponibile</label>
                <label><input name="internalDelivery" type="checkbox" /><i />Richiedi consegna interna</label>
              </div>
            </div>
            <footer>
              <button type="button" className="cancel" onClick={onClose}>Annulla</button>
              <button type="submit" className="confirm" disabled={busy}>{busy ? "Pubblicazione…" : "Metti in circolo →"}</button>
            </footer>
          </>
        )}
      </form>
    </div>
  );
}

function RequestModal({
  listing,
  busy,
  onClose,
  onSave,
}: {
  listing: Listing;
  busy: boolean;
  onClose: () => void;
  onSave: (payload: Record<string, unknown>) => Promise<void>;
}) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await onSave({ message: form.get("message"), deliveryRequested: form.get("deliveryRequested") === "on" });
  }
  return (
    <div className="modal-layer compact">
      <form className="action-modal request-modal" onSubmit={submit}>
        <header>
          <div><span>RICHIESTA</span><h2>{listing.title}</h2></div>
          <button type="button" onClick={onClose}>×</button>
        </header>
        <div className="modal-body">
          <div className="request-summary">
            <i>{listing.item.slice(0, 2).toUpperCase()}</i>
            <span>
              <small>{categoryName(listing.category)} · {listing.city}</small>
              <b>{listing.item}</b>
              <p>Prezzo mercato capitalista: <strong>€ {formatMoney(listing.marketPrice)}</strong></p>
            </span>
          </div>
          <Field label="Messaggio a chi offre il bene">
            <textarea name="message" rows={5} placeholder="Spiega la tua richiesta e proponi come organizzarvi." required />
          </Field>
          <label className="toggle-row">
            <input name="deliveryRequested" type="checkbox" />
            <i />
            <span><b>Vorrei usare la consegna interna</b><small>La richiesta entrerà nel futuro flusso logistico del portale Lavoro.</small></span>
          </label>
          <div className="social-value-lock large">
            <i>SV</i>
            <span><b>Pagamento in punti sociali non ancora disponibile</b><small>La richiesta segue per ora la modalità {listing.mode} scelta da chi offre.</small></span>
            <em>LOCK</em>
          </div>
        </div>
        <footer>
          <button type="button" className="cancel" onClick={onClose}>Annulla</button>
          <button type="submit" className="confirm" disabled={busy}>{busy ? "Invio…" : "Invia richiesta →"}</button>
        </footer>
      </form>
    </div>
  );
}

function Field({ label, wide = false, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <label className={`field ${wide ? "wide" : ""}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function PanelIntro({ title, text }: { title: string; text: string }) {
  return (
    <div className="panel-intro">
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}

function profileDraft(profile: EconomicProfile | null): ProfileDraft {
  return {
    city: profile?.city ?? "",
    postalCode: profile?.postalCode ?? "",
    householdSize: profile?.householdSize ?? 1,
    radiusKm: profile?.radiusKm ?? 15,
    needs: profile?.needs.length ? profile.needs : [newNeed()],
    capacities: profile?.capacities ?? [],
    contributionAreas: profile?.contributionAreas ?? [],
    contributionHours: profile?.contributionHours ?? 0,
    availability: profile?.availability ?? "",
    mobility: profile?.mobility ?? "nessuna",
    canDeliver: profile?.canDeliver ?? false,
    learningInterests: profile?.learningInterests ?? [],
  };
}

function newNeed(): ConsumptionNeed {
  return {
    id: crypto.randomUUID(),
    category: "ortofrutta",
    item: "",
    quantity: 1,
    unit: "kg",
    cadence: "settimanale",
    priority: "importante",
    alternatives: "",
    notes: "",
  };
}

function newCapacity(): CapacityOffer {
  return {
    id: crypto.randomUUID(),
    category: "ortofrutta",
    activity: "",
    capacity: 1,
    unit: "kg",
    cadence: "mensile",
    experience: "autonoma",
    resources: "",
    availability: "",
  };
}

function groupedCategoryOptions() {
  return (["cibo", "bevande", "beni"] as const).map((group) => (
    <optgroup label={group === "cibo" ? "Cibo vegano" : group === "bevande" ? "Bevande" : "Beni"} key={group}>
      {categories.filter((category) => category.group === group).map((category) => (
        <option value={category.id} key={category.id}>{category.name}</option>
      ))}
    </optgroup>
  ));
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase() || "TS";
}

function formatMoney(value: number) {
  return value.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatNumber(value: number) {
  return value.toLocaleString("it-IT", { maximumFractionDigits: 2 });
}

function normalizeForClient(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
