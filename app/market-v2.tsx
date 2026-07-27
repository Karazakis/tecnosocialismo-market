"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { SuiteUser } from "@/lib/auth";
import { categories, categoryById, categoryName, isEdibleCategory, units } from "@/lib/catalog";
import type { DemandEntry, Listing, ListingMode, MarketDashboard, MarketOrder } from "@/lib/model";

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
  ["Home", "https://tecnosocialismo.com", "TS"], ["Iskra", "https://iskra.tecnosocialismo.com", "IK"],
  ["Rizoma", "https://rizoma.tecnosocialismo.com", "RZ"], ["Cloud", "https://cloud.tecnosocialismo.com", "CL"],
  ["Mail", "https://mail.tecnosocialismo.com", "ML"], ["Video", "https://video.tecnosocialismo.com", "VD"],
  ["Social", "https://social.tecnosocialismo.com", "SO"], ["Sport", "https://sport.tecnosocialismo.com", "FT"],
  ["Lavoro", "https://lavoro.tecnosocialismo.com", "LW"], ["Azienda", "https://azienda.tecnosocialismo.com", "AZ"],
  ["Messaggi", "https://messaggi.tecnosocialismo.com", "MS"],
  ["Militant", "https://militant.tecnosocialismo.com", "MT"],
] as const;

type CommercePanel = "listing" | "request" | "cart" | "orders" | null;
type Lane = "tutto" | "spesa" | "piatto-pronto" | "beni";
type CartLine = { id: string; quantity: number };

export function MarketV2({ user }: { user: SuiteUser | null }) {
  const [data, setData] = useState<MarketDashboard>(emptyDashboard);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("tutte");
  const [lane, setLane] = useState<Lane>("tutto");
  const [panel, setPanel] = useState<CommercePanel>(null);
  const [selected, setSelected] = useState<Listing | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const returnTo = "https://market.tecnosocialismo.com";
  const loginUrl = `https://login.tecnosocialismo.com?returnTo=${encodeURIComponent(returnTo)}`;
  const profileUrl = `https://login.tecnosocialismo.com?setup=economy&returnTo=${encodeURIComponent(returnTo)}`;

  async function refresh() {
    const response = await fetch("/api/dashboard", { cache: "no-store" }).catch(() => null);
    if (response?.ok) setData(await response.json() as MarketDashboard);
    setLoading(false);
  }

  useEffect(() => {
    // Il caricamento iniziale sincronizza la vista con archivio e carrello del dispositivo.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    try {
      const saved = JSON.parse(window.localStorage.getItem("ts-market-cart") ?? "[]") as CartLine[];
      if (Array.isArray(saved)) setCart(saved.filter((line) => line && typeof line.id === "string" && Number(line.quantity) > 0));
    } catch { /* carrello locale non valido: riparte vuoto */ }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("ts-market-cart", JSON.stringify(cart));
  }, [cart]);

  const ownNeeds = useMemo(
    () => new Set(data.profile?.needs.map((need) => `${need.category}|${normalize(need.item)}`) ?? []),
    [data.profile],
  );
  const visible = useMemo(() => {
    const needle = normalize(query);
    return data.listings.filter((listing) => {
      const productType = listing.productType ?? (listing.group === "beni" ? "bene" : "spesa");
      const laneMatch = lane === "tutto" || (lane === "beni" ? listing.group === "beni" : productType === lane);
      const categoryMatch = category === "tutte" || listing.category === category;
      const queryMatch = !needle || normalize([listing.title, listing.item, listing.description, listing.storeName, listing.city].join(" ")).includes(needle);
      return listing.status === "disponibile" && laneMatch && categoryMatch && queryMatch;
    });
  }, [category, data.listings, lane, query]);
  const express = visible.filter((listing) => listing.expressDelivery || listing.preparationMinutes);
  const cartItems = cart.flatMap((line) => {
    const listing = data.listings.find((item) => item.id === line.id);
    return listing ? [{ listing, quantity: Math.min(line.quantity, listing.stock || 1) }] : [];
  });

  function toast(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 3600);
  }

  function requireProfile(action: () => void) {
    if (!user) return window.location.assign(loginUrl);
    if (!data.profile) return window.location.assign(profileUrl);
    action();
  }

  async function act(body: Record<string, unknown>, success: string) {
    setBusy(true);
    const response = await fetch("/api/actions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const payload = response ? await response.json().catch(() => ({})) as { error?: string } : {};
    setBusy(false);
    if (!response?.ok) {
      toast(payload.error || "Operazione non riuscita.");
      if (response?.status === 409 && payload.error?.includes("paniere")) window.location.assign(profileUrl);
      return false;
    }
    await refresh();
    toast(success);
    return true;
  }

  function addToCart(listing: Listing) {
    requireProfile(() => {
      if (!ownNeeds.has(`${listing.category}|${normalize(listing.item)}`)) {
        toast("Aggiungi prima questo prodotto al paniere generale del tuo account.");
        window.setTimeout(() => window.location.assign(profileUrl), 900);
        return;
      }
      setCart((current) => {
        const existing = current.find((line) => line.id === listing.id);
        return existing
          ? current.map((line) => line.id === listing.id ? { ...line, quantity: Math.min((listing.stock || 1), line.quantity + 1) } : line)
          : [...current, { id: listing.id, quantity: 1 }];
      });
      toast(`${listing.title} aggiunto al carrello.`);
    });
  }

  function openRequest(listing: Listing) {
    requireProfile(() => {
      if (!ownNeeds.has(`${listing.category}|${normalize(listing.item)}`)) return window.location.assign(profileUrl);
      setSelected(listing);
      setPanel("request");
    });
  }

  async function checkout(payload: Record<string, unknown>) {
    const complete = await act({ action: "create-order", items: cartItems.map((item) => ({ id: item.listing.id, quantity: item.quantity })), ...payload }, "Ordine creato. Puoi seguirne lo stato nella sezione Ordini.");
    if (complete) {
      setCart([]);
      setPanel("orders");
    }
  }

  async function createListing(payload: Record<string, unknown>) {
    const complete = await act({ action: "create-listing", ...payload }, "Prodotto pubblicato nel catalogo.");
    if (complete) setPanel(null);
  }

  async function requestListing(payload: Record<string, unknown>) {
    if (!selected) return;
    const complete = await act({ action: "request-listing", id: selected.id, ...payload }, "Richiesta inviata e bene riservato.");
    if (complete) { setSelected(null); setPanel(null); }
  }

  return (
    <div className="market-shell commerce-shell">
      <header className="topbar commerce-topbar">
        <a className="ts-brand" href="https://tecnosocialismo.com"><i /><span>TECNO<br />SOCIALISMO</span></a>
        <Link className="market-brand" href="/"><b>MK</b><span>Market<small>BENI · SPESA · DELIVERY</small></span></Link>
        <label className="top-search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cerca prodotti, piatti, negozi e categorie" />{query && <button type="button" onClick={() => setQuery("")}>×</button>}</label>
        <nav className="top-actions commerce-actions">
          <button className="location-button" type="button" onClick={() => window.location.assign(profileUrl)}><i>⌖</i><span>{data.profile?.city || "Imposta zona"}</span></button>
          <button className="orders-button" type="button" onClick={() => requireProfile(() => setPanel("orders"))}>Ordini <i>{data.orders.length}</i></button>
          <button className="cart-button" type="button" onClick={() => requireProfile(() => setPanel("cart"))}>Carrello <i>{cart.reduce((sum, line) => sum + line.quantity, 0)}</i></button>
          <button className="suite-trigger" type="button" onClick={() => setMenu((value) => !value)}>Servizi <span>⌄</span></button>
          <a className={user ? "account-pill signed" : "account-pill"} href={loginUrl}>{user ? initials(user.name) : "Accedi"}</a>
        </nav>
        {menu && <div className="suite-menu"><header><span>ECOSISTEMA</span><button type="button" onClick={() => setMenu(false)}>×</button></header><div>{suiteLinks.map(([name, href, mark]) => <a href={href} key={name}><i>{mark}</i><span>{name}</span><b>↗</b></a>)}</div></div>}
      </header>

      <aside className="sidebar commerce-sidebar">
        <section className="side-intro"><span>CATALOGO / LIVE</span><p>Un solo posto per spesa vegana, piatti pronti e ogni tipo di bene richiesto.</p></section>
        <nav className="commerce-lanes">
          {([[
            "tutto", "Tutto il Market", "00"], ["spesa", "Spesa vegana", "01"], ["piatto-pronto", "Piatti pronti", "02"], ["beni", "Beni e negozi", "03"]] as [Lane, string, string][]).map(([id, label, mark]) => <button type="button" className={lane === id ? "active" : ""} onClick={() => { setLane(id); setCategory("tutte"); }} key={id}><i>{mark}</i><span>{label}</span><b>→</b></button>)}
        </nav>
        <div className="side-categories">
          <span>CATEGORIE</span>
          {categories.slice(0, 12).map((item) => <button type="button" className={category === item.id ? "active" : ""} onClick={() => setCategory(category === item.id ? "tutte" : item.id)} key={item.id}><i>{item.mark}</i>{item.name}<b>{data.listings.filter((listing) => listing.category === item.id && listing.status === "disponibile").length}</b></button>)}
        </div>
        <section className="collective-pulse compact-pulse"><header><span>DOMANDA COLLETTIVA</span><i /></header><b>{data.demand.length}</b><small>voci richieste e pubblicabili</small><button type="button" onClick={() => window.location.assign(profileUrl)}>{data.profile ? "Modifica il mio paniere" : "Completa il paniere"}</button></section>
      </aside>

      <main className="main-content commerce-main">
        <section className="commerce-hero">
          <div className="commerce-hero-copy">
            <p>MARKET TECNOSOCIALISTA <i /></p>
            <h1>Tutto ciò che serve.<span>Anche in 30 minuti.</span></h1>
            <p className="commerce-lead">Spesa vegana, piatti pronti e beni di ogni tipo. Acquisto, dono e scambio, con consegna locale o spedizione nello stesso flusso.</p>
            <div className="commerce-hero-actions"><button type="button" onClick={() => { setLane("spesa"); document.getElementById("catalogo")?.scrollIntoView(); }}>Fai la spesa <b>→</b></button><button type="button" onClick={() => { setLane("beni"); document.getElementById("catalogo")?.scrollIntoView(); }}>Esplora i beni</button></div>
            {!data.profile && user && <div className="profile-needed"><i>!</i><span><b>Il tuo paniere generale non è ancora configurato</b><small>Serve per acquistare soltanto ciò che hai indicato come necessario.</small></span><button type="button" onClick={() => window.location.assign(profileUrl)}>Configura →</button></div>}
          </div>
          <div className="delivery-system" aria-hidden="true">
            <div className="delivery-core"><i>MK</i><b>{visible.length}</b><small>DISPONIBILI</small></div>
            <div className="delivery-route route-a"><i /><span>SPESA</span></div><div className="delivery-route route-b"><i /><span>PIATTI</span></div><div className="delivery-route route-c"><i /><span>BENI</span></div>
            <div className="delivery-metric metric-a"><span>CONSEGNA</span><b>30′</b><small>quando disponibile</small></div>
            <div className="delivery-metric metric-b"><span>ALIMENTAZIONE</span><b>100%</b><small>vegana</small></div>
          </div>
        </section>

        <section className="shopping-entrypoints">
          {([
            ["spesa", "SP", "Spesa vegana", "Freschi, dispensa e bevande", "Consegna oggi"],
            ["piatto-pronto", "PT", "Piatti pronti", "Cucine, gastronomie e ristorazione", "Anche express"],
            ["beni", "BN", "Beni e negozi", "Casa, tecnologia, abbigliamento e altro", "Ritiro o spedizione"],
          ] as [Lane, string, string, string, string][]).map(([id, mark, title, copy, meta]) => <button type="button" onClick={() => { setLane(id); setCategory("tutte"); document.getElementById("catalogo")?.scrollIntoView(); }} key={id}><i>{mark}</i><span><b>{title}</b><small>{copy}</small></span><em>{meta}</em><strong>→</strong></button>)}
          <button className="sell-entry" type="button" onClick={() => requireProfile(() => setPanel("listing"))}><i>+</i><span><b>Vendi o metti in circolo</b><small>Solo prodotti presenti nella domanda</small></span><em>PERSONE · NEGOZI · COOPERATIVE</em><strong>→</strong></button>
        </section>

        {express.length > 0 && <section className="express-section"><CommerceHeader eyebrow="CONSEGNA RAPIDA" title="A casa il prima possibile" copy="Piatti pronti, spesa locale e prodotti disponibili con consegna rapida." /><div className="express-row">{express.slice(0, 5).map((listing) => <ProductCard listing={listing} own={listing.ownerId === data.viewerId} personallyRequested={ownNeeds.has(`${listing.category}|${normalize(listing.item)}`)} onAdd={() => listing.mode === "vendita" ? addToCart(listing) : openRequest(listing)} compact key={listing.id} />)}</div></section>}

        <section className="catalog-section commerce-catalog" id="catalogo">
          <CommerceHeader eyebrow="CATALOGO COMPLETO" title={lane === "tutto" ? "Beni, spesa e cibo pronto" : lane === "spesa" ? "La tua spesa vegana" : lane === "piatto-pronto" ? "Cucine e piatti pronti" : "Beni e negozi"} copy="Prezzo del mercato capitalista sempre visibile. Punti di valore sociale predisposti, ma non ancora attivi." action="Pubblica un prodotto" onAction={() => requireProfile(() => setPanel("listing"))} />
          <div className="catalog-toolbar"><div>{["tutte", ...categories.filter((item) => lane === "tutto" || (lane === "beni" ? item.group === "beni" : item.group !== "beni")).slice(0, 8).map((item) => item.id)].map((id) => <button type="button" className={category === id ? "active" : ""} onClick={() => setCategory(id)} key={id}>{id === "tutte" ? "Tutte" : categoryName(id)}</button>)}</div><span>{visible.length} prodotti</span></div>
          {loading ? <div className="loading-grid"><i /><i /><i /></div> : visible.length ? <div className="listing-grid commerce-grid">{visible.map((listing) => <ProductCard listing={listing} own={listing.ownerId === data.viewerId} personallyRequested={ownNeeds.has(`${listing.category}|${normalize(listing.item)}`)} onAdd={() => listing.mode === "vendita" ? addToCart(listing) : openRequest(listing)} key={listing.id} />)}</div> : <CommerceEmpty lane={lane} onSell={() => requireProfile(() => setPanel("listing"))} />}
        </section>

        <section className="demand-observatory">
          <CommerceHeader eyebrow="DOMANDA COLLETTIVA" title="Ciò che la rete ha richiesto" copy="Il catalogo può crescere soltanto dentro questi bisogni. Le preferenze arrivano dal paniere compilato durante la registrazione generale." action="Modifica il mio paniere" onAction={() => window.location.assign(profileUrl)} />
          {data.demand.length ? <div className="demand-ticker">{data.demand.slice(0, 12).map((entry, index) => <button type="button" onClick={() => { setLane(categoryById(entry.category)?.group === "beni" ? "beni" : "spesa"); setCategory(entry.category); document.getElementById("catalogo")?.scrollIntoView(); }} key={entry.key}><i>{String(index + 1).padStart(2, "0")}</i><span><b>{entry.item}</b><small>{categoryName(entry.category)}</small></span><em>{entry.people} {entry.people === 1 ? "persona" : "persone"}</em><strong>{entry.totalQuantity.toLocaleString("it-IT")} {entry.unit}</strong></button>)}</div> : <div className="commerce-empty compact"><i>DB</i><div><h3>La domanda inizia dal paniere generale</h3><p>Le prime preferenze aggregate appariranno qui dopo la nuova registrazione.</p></div><button type="button" onClick={() => window.location.assign(profileUrl)}>Configura il paniere →</button></div>}
        </section>
      </main>

      <footer className="site-footer commerce-footer"><a className="ts-brand" href="https://tecnosocialismo.com"><i /><span>TECNOSOCIALISMO</span></a><p>Market riunisce beni, spesa vegana, ristorazione e consegna a partire dai bisogni espressi.</p><div><a href={profileUrl}>Paniere</a><a href="https://tecnosocialismo.com/manifesto">Manifesto</a><a href="https://messaggi.tecnosocialismo.com">Assistenza</a></div></footer>

      {panel === "listing" && <PublishProduct demand={data.demand} profileCity={data.profile?.city ?? ""} busy={busy} onClose={() => setPanel(null)} onSave={createListing} />}
      {panel === "request" && selected && <DirectRequest listing={selected} busy={busy} onClose={() => setPanel(null)} onSave={requestListing} />}
      {panel === "cart" && <CartPanel items={cartItems} busy={busy} profileCity={data.profile?.city ?? ""} onClose={() => setPanel(null)} onQuantity={(id, quantity) => setCart((current) => quantity <= 0 ? current.filter((line) => line.id !== id) : current.map((line) => line.id === id ? { ...line, quantity } : line))} onCheckout={checkout} />}
      {panel === "orders" && <OrdersPanel orders={data.orders} onClose={() => setPanel(null)} />}
      {notice && <div className="toast"><i /><span>{notice}</span></div>}
    </div>
  );
}

function CommerceHeader({ eyebrow, title, copy, action, onAction }: { eyebrow: string; title: string; copy: string; action?: string; onAction?: () => void }) {
  return <header className="section-header commerce-header"><div><span>{eyebrow}</span><h2>{title}</h2></div><p>{copy}</p>{action && onAction && <button type="button" onClick={onAction}>{action}<b>→</b></button>}</header>;
}

function ProductCard({ listing, own, personallyRequested, onAdd, compact = false }: { listing: Listing; own: boolean; personallyRequested: boolean; onAdd: () => void; compact?: boolean }) {
  const edible = listing.group !== "beni";
  const productType = listing.productType ?? (edible ? "spesa" : "bene");
  const eta = listing.expressDelivery ? `${listing.preparationMinutes || 20}–${(listing.preparationMinutes || 20) + 15} min` : listing.shippingAvailable ? `${listing.shippingDaysMin || 1}–${listing.shippingDaysMax || 3} giorni` : listing.internalDelivery ? "Consegna locale" : "Ritiro";
  return <article className={`product-card ${compact ? "compact" : ""}`}>
    <div className={`product-visual type-${productType}`}><header><span>{categoryById(listing.category)?.mark ?? "MK"}</span><b>{listing.mode}</b></header><i /><i /><strong>{listing.item.slice(0, 2).toUpperCase()}</strong>{listing.vegan && <em>VEGANO</em>}<footer><span>{eta}</span><b>{listing.stock || 1} disponibili</b></footer></div>
    <section><small>{listing.storeName || listing.ownerName} · {listing.city}</small><h3>{listing.title}</h3><p>{listing.description}</p>{edible && listing.allergens && <em className="allergen-line">Allergeni: {listing.allergens}</em>}<div className="commerce-prices"><span><small>PREZZO</small><b>{listing.mode === "vendita" ? `€ ${money(listing.askingPrice || 0)}` : listing.mode.toUpperCase()}</b></span><span><small>MERCATO CAPITALISTA</small><b>€ {money(listing.marketPrice)}</b></span></div><div className="card-delivery"><span>{listing.expressDelivery ? "EXPRESS" : listing.shippingAvailable ? "SPEDIZIONE" : "LOCALE"}</span><i>SV</i><small>Punti sociali non attivi</small></div></section>
    <footer><span><i>{initials(listing.storeName || listing.ownerName)}</i><b>{listing.storeName || listing.ownerName}</b></span><button type="button" disabled={own || listing.status !== "disponibile"} onClick={onAdd}>{own ? "È tuo" : listing.status !== "disponibile" ? "Esaurito" : !personallyRequested ? "Aggiungi al paniere" : listing.mode === "vendita" ? "Aggiungi +" : "Richiedi →"}</button></footer>
  </article>;
}

function CommerceEmpty({ lane, onSell }: { lane: Lane; onSell: () => void }) {
  return <div className="commerce-empty"><i>{lane === "piatto-pronto" ? "PT" : lane === "spesa" ? "SP" : "MK"}</i><div><h3>Il catalogo parte dai primi offerenti</h3><p>La domanda è già definita dal paniere. Ora persone, negozi, cucine e cooperative possono pubblicare ciò che è richiesto.</p></div><button type="button" onClick={onSell}>Pubblica il primo prodotto →</button></div>;
}

function PublishProduct({ demand, profileCity, busy, onClose, onSave }: { demand: DemandEntry[]; profileCity: string; busy: boolean; onClose: () => void; onSave: (payload: Record<string, unknown>) => Promise<void> }) {
  const uniqueDemand = useMemo(() => { const seen = new Set<string>(); return demand.filter((entry) => { const key = `${entry.category}|${normalize(entry.item)}`; if (seen.has(key)) return false; seen.add(key); return true; }); }, [demand]);
  const [key, setKey] = useState(uniqueDemand[0]?.key ?? "");
  const [mode, setMode] = useState<ListingMode>("vendita");
  const [type, setType] = useState<"bene" | "spesa" | "piatto-pronto">("bene");
  const selected = uniqueDemand.find((entry) => entry.key === key) ?? uniqueDemand[0];
  const edible = selected ? isEdibleCategory(selected.category) : false;
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (selected) setType(isEdibleCategory(selected.category) ? "spesa" : "bene"); }, [selected]);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!selected) return; const form = new FormData(event.currentTarget); await onSave({ category: selected.category, item: selected.item, productType: type, sellerType: form.get("sellerType"), storeName: form.get("storeName"), title: form.get("title"), description: form.get("description"), quantity: form.get("quantity"), unit: form.get("unit"), stock: form.get("stock"), condition: form.get("condition"), vegan: edible, ingredients: form.get("ingredients"), allergens: form.get("allergens"), preparationMinutes: form.get("preparationMinutes"), mode, marketPrice: form.get("marketPrice"), askingPrice: form.get("askingPrice"), exchangeFor: form.get("exchangeFor"), city: form.get("city"), pickup: form.get("pickup") === "on", internalDelivery: form.get("internalDelivery") === "on", expressDelivery: form.get("expressDelivery") === "on", shippingAvailable: form.get("shippingAvailable") === "on", deliveryFee: form.get("deliveryFee"), freeDeliveryThreshold: form.get("freeDeliveryThreshold"), shippingDaysMin: form.get("shippingDaysMin"), shippingDaysMax: form.get("shippingDaysMax") }); }
  return <div className="commerce-panel-layer"><form className="commerce-panel publish-panel" onSubmit={submit}><header><div><span>NUOVO PRODOTTO</span><h2>Pubblica nel Market</h2></div><button type="button" onClick={onClose}>×</button></header>{!selected ? <div className="panel-empty"><i>DB</i><h3>La domanda non contiene ancora prodotti</h3><p>Il paniere generale deve prima raccogliere almeno una preferenza.</p><button type="button" onClick={onClose}>Chiudi</button></div> : <><div className="panel-scroll"><div className="publication-rule"><i>01</i><span><b>Puoi pubblicare solo ciò che è già richiesto</b><small>Seleziona una voce della domanda collettiva.</small></span></div><Field label="Prodotto richiesto"><select value={key} onChange={(event) => setKey(event.target.value)}>{uniqueDemand.map((entry) => <option value={entry.key} key={entry.key}>{entry.item} · {categoryName(entry.category)} · {entry.people} richieste</option>)}</select></Field><div className="commerce-fields two"><Field label="Tipo di offerente"><select name="sellerType"><option value="persona">Persona</option><option value="negozio">Negozio</option><option value="cooperativa">Cooperativa</option>{edible && <option value="ristorazione">Cucina o ristorazione</option>}</select></Field><Field label="Nome negozio o attività"><input name="storeName" placeholder="Facoltativo per le persone" /></Field></div>{edible && <fieldset className="product-type-picker"><legend>Tipo di offerta</legend><button type="button" className={type === "spesa" ? "active" : ""} onClick={() => setType("spesa")}><i>SP</i><span><b>Spesa</b><small>Prodotto alimentare o bevanda</small></span></button><button type="button" className={type === "piatto-pronto" ? "active" : ""} onClick={() => setType("piatto-pronto")}><i>PT</i><span><b>Piatto pronto</b><small>Preparato al momento o già pronto</small></span></button></fieldset>}<div className="commerce-fields two"><Field label="Titolo"><input name="title" required /></Field><Field label="Condizione o conservazione"><input name="condition" placeholder={edible ? "Fresco, refrigerato, scadenza…" : "Nuovo, rigenerato, usato…"} required /></Field><Field label="Descrizione"><textarea name="description" rows={3} required /></Field><Field label="Città"><input name="city" defaultValue={profileCity} required /></Field></div>{edible && <><div className="vegan-commerce-rule"><i>V</i><span><b>Solo alimentazione vegana</b><small>Confermi l’assenza di ingredienti e componenti di origine animale.</small></span></div><div className="commerce-fields two"><Field label="Ingredienti"><textarea name="ingredients" rows={3} required /></Field><Field label="Allergeni"><textarea name="allergens" rows={3} placeholder="Glutine, frutta a guscio…" /></Field></div></>}<div className="commerce-fields four"><Field label="Quantità per unità"><input name="quantity" type="number" min="0.01" step="0.01" defaultValue="1" required /></Field><Field label="Unità"><select name="unit" defaultValue={selected.unit}>{units.map((unit) => <option key={unit}>{unit}</option>)}</select></Field><Field label="Disponibilità"><input name="stock" type="number" min="1" defaultValue="1" required /></Field>{edible ? <Field label="Preparazione (min)"><input name="preparationMinutes" type="number" min="0" defaultValue={type === "piatto-pronto" ? "20" : "0"} /></Field> : <span />}</div><fieldset className="commerce-mode"><legend>Modalità economica</legend>{(["vendita", "dono", "scambio"] as const).map((item) => <button type="button" className={mode === item ? "active" : ""} onClick={() => setMode(item)} key={item}>{item === "vendita" ? "€" : item === "dono" ? "●" : "⇄"}<span><b>{item}</b><small>{item === "vendita" ? "Carrello e ordine" : item === "dono" ? "Richiesta diretta" : "Proposta diretta"}</small></span></button>)}</fieldset><div className="commerce-fields three"><Field label="Prezzo mercato capitalista"><input name="marketPrice" type="number" min="0.01" step="0.01" required /></Field>{mode === "vendita" && <Field label="Prezzo richiesto"><input name="askingPrice" type="number" min="0.01" step="0.01" required /></Field>}{mode === "scambio" && <Field label="Scambio desiderato"><input name="exchangeFor" /></Field>}<Field label="Costo consegna"><input name="deliveryFee" type="number" min="0" step="0.01" defaultValue="0" /></Field></div><div className="fulfillment-box"><span>CONSEGNA E RITIRO</span><div><label><input name="pickup" type="checkbox" defaultChecked /><i />Ritiro</label><label><input name="internalDelivery" type="checkbox" defaultChecked /><i />Consegna interna</label><label><input name="expressDelivery" type="checkbox" defaultChecked={type === "piatto-pronto"} /><i />Express</label><label><input name="shippingAvailable" type="checkbox" defaultChecked={!edible} /><i />Spedizione</label></div><div className="commerce-fields three"><Field label="Gratis oltre €"><input name="freeDeliveryThreshold" type="number" min="0" step="0.01" /></Field><Field label="Spedizione minima"><input name="shippingDaysMin" type="number" min="1" defaultValue="1" /></Field><Field label="Spedizione massima"><input name="shippingDaysMax" type="number" min="1" defaultValue="3" /></Field></div></div></div><footer><button type="button" onClick={onClose}>Annulla</button><button className="primary" type="submit" disabled={busy}>{busy ? "Pubblicazione…" : "Pubblica →"}</button></footer></>}</form></div>;
}

function CartPanel({ items, busy, profileCity, onClose, onQuantity, onCheckout }: { items: { listing: Listing; quantity: number }[]; busy: boolean; profileCity: string; onClose: () => void; onQuantity: (id: string, quantity: number) => void; onCheckout: (payload: Record<string, unknown>) => Promise<void> }) {
  const options = (["consegna-interna", "express", "spedizione", "ritiro"] as MarketOrder["fulfillment"][]).filter((mode) => items.length && items.every(({ listing }) => mode === "ritiro" ? listing.pickup : mode === "express" ? listing.expressDelivery : mode === "spedizione" ? listing.shippingAvailable : listing.internalDelivery));
  const [fulfillment, setFulfillment] = useState<MarketOrder["fulfillment"]>(options[0] ?? "ritiro");
  const subtotal = items.reduce((sum, item) => sum + (item.listing.askingPrice || 0) * item.quantity, 0);
  const marketTotal = items.reduce((sum, item) => sum + item.listing.marketPrice * item.quantity, 0);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); await onCheckout({ fulfillment, address: form.get("address"), deliverySlot: form.get("deliverySlot") }); }
  return <div className="commerce-panel-layer right"><form className="commerce-panel cart-panel" onSubmit={submit}><header><div><span>CARRELLO</span><h2>{items.length} {items.length === 1 ? "prodotto" : "prodotti"}</h2></div><button type="button" onClick={onClose}>×</button></header>{items.length ? <><div className="panel-scroll"><div className="cart-list">{items.map(({ listing, quantity }) => <article key={listing.id}><i>{listing.item.slice(0, 2).toUpperCase()}</i><span><small>{listing.storeName || listing.ownerName}</small><b>{listing.title}</b><em>€ {money(listing.askingPrice || 0)} · rif. € {money(listing.marketPrice)}</em></span><div><button type="button" onClick={() => onQuantity(listing.id, quantity - 1)}>−</button><b>{quantity}</b><button type="button" onClick={() => onQuantity(listing.id, Math.min(listing.stock || 1, quantity + 1))}>+</button></div></article>)}</div><fieldset className="checkout-fulfillment"><legend>Come vuoi riceverlo?</legend>{options.map((option) => <button type="button" className={fulfillment === option ? "active" : ""} onClick={() => setFulfillment(option)} key={option}><i>{option === "express" ? "30′" : option === "spedizione" ? "PK" : option === "ritiro" ? "RT" : "TS"}</i><span><b>{option.replace("-", " ")}</b><small>{option === "express" ? "Il prima possibile" : option === "spedizione" ? "Con tracciamento" : option === "ritiro" ? "Senza consegna" : "Logistica della rete"}</small></span></button>)}</fieldset>{fulfillment !== "ritiro" && <Field label="Indirizzo di consegna"><input name="address" defaultValue={profileCity} placeholder="Via, numero civico, città e indicazioni" required /></Field>}<Field label="Fascia oraria"><select name="deliverySlot"><option>Prima disponibilità</option><option>Oggi, 18:00–20:00</option><option>Domani, 09:00–12:00</option><option>Domani, 18:00–20:00</option><option>Da concordare</option></select></Field><div className="cart-totals"><span><small>PREZZO MERCATO CAPITALISTA</small><b>€ {money(marketTotal)}</b></span><span><small>SUBTOTALE RICHIESTO</small><b>€ {money(subtotal)}</b></span><span><small>CONSEGNA</small><b>Calcolata nell’ordine</b></span><strong><small>TOTALE PARZIALE</small><b>€ {money(subtotal)}</b></strong></div><div className="social-checkout"><i>SV</i><span><b>Punti di valore sociale</b><small>Saldo e pagamento saranno abilitati in una fase successiva.</small></span><em>LOCK</em></div></div><footer><button type="button" onClick={onClose}>Continua gli acquisti</button><button className="primary" type="submit" disabled={busy || !options.length}>{busy ? "Creazione ordine…" : "Conferma ordine →"}</button></footer></> : <div className="panel-empty"><i>CR</i><h3>Il carrello è vuoto</h3><p>Aggiungi prodotti dal catalogo per creare un ordine unico.</p><button type="button" onClick={onClose}>Vai al catalogo</button></div>}</form></div>;
}

function OrdersPanel({ orders, onClose }: { orders: MarketOrder[]; onClose: () => void }) {
  return <div className="commerce-panel-layer right"><section className="commerce-panel orders-panel"><header><div><span>I MIEI ORDINI</span><h2>Acquisti e consegne</h2></div><button type="button" onClick={onClose}>×</button></header><div className="panel-scroll">{orders.length ? <div className="orders-list">{orders.map((order) => <article key={order.id}><header><span><i>{initials(order.storeName)}</i><b>{order.storeName}</b></span><em className={`status-${order.status}`}>{order.status.replaceAll("-", " ")}</em></header><div>{order.lines.map((line) => <span key={line.listingId}><b>{line.quantity}×</b>{line.title}<em>€ {money(line.unitPrice * line.quantity)}</em></span>)}</div><footer><span><small>{order.fulfillment.replaceAll("-", " ")} · {order.deliverySlot}</small><b>Ordine {order.id.slice(0, 8).toUpperCase()}</b></span><strong>€ {money(order.total)}</strong></footer><div className="order-progress"><i className="done" /><i className={order.status !== "richiesto" ? "done" : ""} /><i className={order.status === "in-consegna" || order.status === "consegnato" ? "done" : ""} /><i className={order.status === "consegnato" ? "done" : ""} /></div></article>)}</div> : <div className="panel-empty"><i>OR</i><h3>Nessun ordine ancora</h3><p>Qui seguirai conferma, preparazione, consegna e completamento.</p><button type="button" onClick={onClose}>Esplora il Market</button></div>}</div></section></div>;
}

function DirectRequest({ listing, busy, onClose, onSave }: { listing: Listing; busy: boolean; onClose: () => void; onSave: (payload: Record<string, unknown>) => Promise<void> }) {
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); await onSave({ message: form.get("message"), deliveryRequested: form.get("deliveryRequested") === "on" }); }
  return <div className="commerce-panel-layer right"><form className="commerce-panel direct-panel" onSubmit={submit}><header><div><span>{listing.mode.toUpperCase()}</span><h2>{listing.title}</h2></div><button type="button" onClick={onClose}>×</button></header><div className="panel-scroll"><div className="direct-summary"><i>{listing.item.slice(0, 2).toUpperCase()}</i><span><small>{listing.storeName || listing.ownerName} · {listing.city}</small><b>{listing.item}</b><p>Valore mercato capitalista: € {money(listing.marketPrice)}</p></span></div>{listing.mode === "scambio" && <div className="exchange-wanted">Scambio desiderato: <b>{listing.exchangeFor || "Proposta libera"}</b></div>}<Field label="Messaggio"><textarea name="message" rows={6} placeholder="Presentati e proponi come organizzare lo scambio o il dono." required /></Field><label className="delivery-check"><input name="deliveryRequested" type="checkbox" /><i /><span><b>Richiedi consegna interna</b><small>La disponibilità verrà verificata dalla rete logistica.</small></span></label></div><footer><button type="button" onClick={onClose}>Annulla</button><button className="primary" type="submit" disabled={busy}>{busy ? "Invio…" : "Invia richiesta →"}</button></footer></form></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="commerce-field"><span>{label}</span>{children}</label>; }
function normalize(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
function initials(value: string) { return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "MK"; }
function money(value: number) { return Number(value || 0).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
