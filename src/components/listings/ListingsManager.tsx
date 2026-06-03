import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ImageIcon } from "lucide-react";
import toast from "react-hot-toast";
import { Icon } from "@/components/ai-v2/Icon";
import { Wcv2Portal } from "@/components/ai-v2/Portal";
import { TONES } from "@/components/ai-v2/tones";
import AttachmentGallery from "@/components/AttachmentGallery";
import AttachmentChips from "@/components/inbox/components/AttachmentChips";
import { uploadMessageAttachments, type UploadedAttachment } from "@/utils/messageAttachments";
import {
  fetchListings, createListing, updateListing, deleteListing, updateListingSearch,
} from "@/helpers/backend";
import "@/components/ai-v2/prototype.css";

// Listing photos reuse the SHARED message-attachments gallery (the inbox's
// component + endpoints). A listing just remembers which storage_keys it picked.
const API_BASE = import.meta.env.VITE_API_BASE;
const MAX_LISTING_PHOTOS = 8;

/* Listings - the agent's property inventory, embedded as a view inside the
   Deals page. The inbound AI matches a buyer's stated criteria against these
   via the search_listings tool (gated by the "Listing search" toggle). Real
   CRUD against /api/listings; created/edited listings show up immediately and
   the AI uses them on the next inbound reply. */

// Mirror MAX_LISTINGS_PER_USER in functions/_shared/listings.ts.
const MAX_LISTINGS = 1000;

interface ListingImage { key: string; url: string }
interface Listing {
  id: number;
  address: string | null; city: string | null; state: string | null; zip: string | null;
  price: number | null; bedrooms: number | null; bathrooms: number | null; square_feet: number | null;
  property_type: string | null; listing_type: string; status: string;
  url: string | null; description: string | null; enabled: number;
  images?: ListingImage[];
}

const PROPERTY_TYPES = [
  { value: "single_family", label: "Single family" },
  { value: "condo", label: "Condo" },
  { value: "townhouse", label: "Townhouse" },
  { value: "multi_family", label: "Multi-family" },
  { value: "land", label: "Land" },
  { value: "other", label: "Other" },
];
const STATUSES = [
  { value: "active", label: "Active", tone: "green" },
  { value: "coming_soon", label: "Coming soon", tone: "blue" },
  { value: "pending", label: "Pending", tone: "amber" },
  { value: "sold", label: "Sold", tone: "neutral" },
  { value: "off_market", label: "Off market", tone: "neutral" },
];
const LISTING_TYPES = [{ value: "sale", label: "For sale" }, { value: "rent", label: "For rent" }];

const labelOf = (arr: { value: string; label: string }[], v: string | null) =>
  arr.find((x) => x.value === v)?.label || (v || "-");
const fmt$ = (n: number | null) => (n == null ? "-" : "$" + Number(n).toLocaleString("en-US"));

// Small inline switch (the design has no dedicated switch class; inline styles
// outrank prototype.css unlayered rules inside .wcv2).
function Switch({ on, onChange, title }: { on: boolean; onChange: (v: boolean) => void; title?: string }) {
  return (
    <button title={title} onClick={() => onChange(!on)} style={{
      width: 38, height: 22, borderRadius: 999, flex: "none", position: "relative",
      background: on ? "var(--accent)" : "var(--line-strong, #D8D4CD)", transition: "background .15s",
    }}>
      <span style={{
        position: "absolute", top: 2, left: on ? 18 : 2, width: 18, height: 18,
        borderRadius: "50%", background: "#fff", transition: "left .15s",
      }} />
    </button>
  );
}

const FIELD = { label: { display: "block", fontSize: 10.5, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--ink-3)", marginBottom: 3 } as React.CSSProperties };

function LField({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="wc-modal-field"><div style={FIELD.label}>{label}</div>{children}</div>;
}

interface FormState {
  address: string; city: string; state: string; zip: string;
  price: string; bedrooms: string; bathrooms: string; square_feet: string;
  property_type: string; listing_type: string; status: string;
  url: string; description: string;
  enabled: boolean;
}
type StringField = Exclude<keyof FormState, "enabled">;

const emptyForm = (): FormState => ({
  address: "", city: "", state: "", zip: "", price: "", bedrooms: "", bathrooms: "",
  square_feet: "", property_type: "single_family", listing_type: "sale", status: "active",
  url: "", description: "", enabled: true,
});

const toForm = (l: Listing): FormState => ({
  address: l.address || "", city: l.city || "", state: l.state || "", zip: l.zip || "",
  price: l.price != null ? String(l.price) : "", bedrooms: l.bedrooms != null ? String(l.bedrooms) : "",
  bathrooms: l.bathrooms != null ? String(l.bathrooms) : "", square_feet: l.square_feet != null ? String(l.square_feet) : "",
  property_type: l.property_type || "single_family", listing_type: l.listing_type || "sale",
  status: l.status || "active", url: l.url || "",
  description: l.description || "", enabled: l.enabled === 1,
});

function ListingModal({ initial, onClose, onSave }: {
  initial: Listing | null; onClose: () => void; onSave: (data: Record<string, unknown>) => void;
}) {
  const [f, setF] = useState<FormState>(initial ? toForm(initial) : emptyForm());
  const set = (k: StringField) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));
  const downOnScrim = useRef(false);
  const can = f.address.trim() !== "";

  // Photos reuse the shared message-attachments gallery (the inbox's
  // AttachmentGallery dropdown + Add-image upload). A listing remembers which
  // storage_keys it picked; the AI texts them over MMS via listingMediaUrls,
  // which resolves the same /api/media/message-attachments/<key> route.
  const token = localStorage.getItem("token") || "";
  const [selected, setSelected] = useState<UploadedAttachment[]>(
    (initial?.images ?? []).map((i) => ({
      id: i.key, storage_key: i.key, url: i.url,
      name: i.key.split("/").pop() || "photo", content_type: "image/jpeg",
    })),
  );
  const [uploading, setUploading] = useState(false);
  const keyOf = (a: UploadedAttachment) => a.storage_key || a.id;
  const addAttachment = (a: UploadedAttachment) =>
    setSelected((p) => (p.some((x) => keyOf(x) === keyOf(a)) || p.length >= MAX_LISTING_PHOTOS ? p : [...p, a]));
  const removeAttachment = (id: string) => setSelected((p) => p.filter((x) => x.id !== id));
  const onUpload = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setUploading(true);
    try {
      const up = await uploadMessageAttachments(API_BASE, token, files);
      setSelected((p) => [...p, ...up.filter((a) => !p.some((x) => keyOf(x) === keyOf(a)))].slice(0, MAX_LISTING_PHOTOS));
    } catch (e) {
      toast.error((e as Error)?.message || "Failed to upload");
    } finally {
      setUploading(false);
    }
  };

  const submit = () => {
    if (!can) return;
    onSave({
      address: f.address.trim(), city: f.city.trim() || null, state: f.state.trim() || null, zip: f.zip.trim() || null,
      price: f.price === "" ? null : Number(f.price), bedrooms: f.bedrooms === "" ? null : Number(f.bedrooms),
      bathrooms: f.bathrooms === "" ? null : Number(f.bathrooms), square_feet: f.square_feet === "" ? null : Number(f.square_feet),
      property_type: f.property_type, listing_type: f.listing_type, status: f.status,
      url: f.url.trim() || null,
      description: f.description.trim() || null, enabled: f.enabled,
      image_keys: selected.map(keyOf),
    });
  };

  return (
    <Wcv2Portal>
    <div className="wc-modal-scrim"
      onMouseDown={(e) => { downOnScrim.current = e.target === e.currentTarget; }}
      onClick={(e) => { if (e.target === e.currentTarget && downOnScrim.current) onClose(); }}>
      <div className="wc-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 540, padding: "18px 20px 14px" }}>
        <button className="wc-modal-x" onClick={onClose}><Icon name="x" size={18} /></button>
        <div className="wc-card-h2" style={{ marginBottom: 10 }}>{initial ? "Edit listing" : "Add listing"}</div>

        <div className="wc-modal-fieldfull" style={{ marginBottom: 10 }}>
          <div style={FIELD.label}>Address</div>
          <input className="wc-modal-input" placeholder="123 Oak St" autoFocus value={f.address} onChange={set("address")} />
        </div>

        <div className="wc-modal-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)", gap: "10px 14px", marginBottom: 12 }}>
          <LField label="City"><input className="wc-modal-input" value={f.city} onChange={set("city")} /></LField>
          <LField label="State"><input className="wc-modal-input" value={f.state} onChange={set("state")} /></LField>
          <LField label="ZIP"><input className="wc-modal-input" value={f.zip} onChange={set("zip")} /></LField>
          <LField label={f.listing_type === "rent" ? "Monthly rent" : "Price"}>
            <input className="wc-modal-input wc-mono" type="number" placeholder="0" value={f.price} onChange={set("price")} />
          </LField>
          <LField label="Listing type">
            <select className="wc-modal-input wc-modal-select" value={f.listing_type} onChange={set("listing_type")}>
              {LISTING_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </LField>
          <LField label="Status">
            <select className="wc-modal-input wc-modal-select" value={f.status} onChange={set("status")}>
              {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </LField>
          <LField label="Bedrooms"><input className="wc-modal-input wc-mono" type="number" placeholder="0" value={f.bedrooms} onChange={set("bedrooms")} /></LField>
          <LField label="Bathrooms"><input className="wc-modal-input wc-mono" type="number" placeholder="0" value={f.bathrooms} onChange={set("bathrooms")} /></LField>
          <LField label="Square feet"><input className="wc-modal-input wc-mono" type="number" placeholder="0" value={f.square_feet} onChange={set("square_feet")} /></LField>
          <LField label="Property type">
            <select className="wc-modal-input wc-modal-select" value={f.property_type} onChange={set("property_type")}>
              {PROPERTY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </LField>
          <LField label="Listing URL"><input className="wc-modal-input" placeholder="https://..." value={f.url} onChange={set("url")} /></LField>
        </div>

        <div className="wc-modal-fieldfull" style={{ marginBottom: 10 }}>
          <div style={FIELD.label}>Description</div>
          <textarea className="wc-modal-textarea" style={{ minHeight: 50 }} placeholder="Key features the AI can mention..." value={f.description} onChange={set("description")} />
        </div>

        <div className="wc-modal-fieldfull" style={{ marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <div style={FIELD.label}>Photos &middot; {selected.length}/{MAX_LISTING_PHOTOS}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">
                <ImageIcon size={14} />{uploading ? "Uploading..." : "Add image"}
                <input type="file" multiple accept="image/*" className="hidden" disabled={uploading}
                  onChange={(e) => { onUpload(e.target.files); e.target.value = ""; }} />
              </label>
              {token && <AttachmentGallery apiBase={API_BASE} token={token} isBottom onSelect={addAttachment} onDelete={(key) => setSelected((p) => p.filter((x) => keyOf(x) !== key))} />}
            </div>
          </div>
          {selected.length > 0 ? (
            <AttachmentChips attachments={selected} removable onRemove={removeAttachment} />
          ) : (
            <div className="wc-band-d" style={{ fontSize: 11.5 }}>Add photos, or pick from your gallery (the same gallery as the inbox) using the arrow. The AI texts the selected photos over MMS when a buyer asks to see the home.</div>
          )}
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, fontWeight: 600, color: "var(--ink-2)", margin: "2px 0 12px", cursor: "pointer" }}>
          <Switch on={f.enabled} onChange={(v) => setF((p) => ({ ...p, enabled: v }))} />
          Visible to the AI (the agent can match buyers to this listing)
        </label>

        <div className="wc-modal-foot">
          <button className="wc-ghostbtn" onClick={onClose}>Cancel</button>
          <button className="wc-primary" disabled={!can} onClick={submit}>{initial ? "Save listing" : "Add listing"}</button>
        </div>
      </div>
    </div>
    </Wcv2Portal>
  );
}

export function ListingsManager() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["listings"],
    queryFn: () => fetchListings() as Promise<{ listings: Listing[]; settings: { search_enabled: boolean } }>,
  });
  const listings = data?.listings ?? [];
  const searchEnabled = data?.settings?.search_enabled ?? true;

  const refresh = () => qc.invalidateQueries({ queryKey: ["listings"] });
  const [modal, setModal] = useState<{ initial: Listing | null } | null>(null);
  const [confirmDel, setConfirmDel] = useState<Listing | null>(null);

  const createMut = useMutation({ mutationFn: (d: Record<string, unknown>) => createListing(d), onSuccess: () => { refresh(); setModal(null); } });
  const updateMut = useMutation({ mutationFn: (v: { id: number; d: Record<string, unknown> }) => updateListing(v.id, v.d), onSuccess: () => { refresh(); setModal(null); } });
  const delMut = useMutation({ mutationFn: (id: number) => deleteListing(id), onSuccess: () => { refresh(); setConfirmDel(null); } });
  const toggleEnabled = useMutation({ mutationFn: (v: { id: number; enabled: boolean }) => updateListing(v.id, { enabled: v.enabled }), onSuccess: () => refresh() });
  const searchMut = useMutation({ mutationFn: (v: boolean) => updateListingSearch(v), onSuccess: () => refresh() });

  const offerable = listings.filter((l) => l.enabled === 1 && ["active", "coming_soon", "pending"].includes(l.status)).length;

  return (
    <div className="wc-page wc-fade">
      <div className="wc-pagehead">
        <div>
          <h1>Listings</h1>
          <p>{listings.length} {listings.length === 1 ? "property" : "properties"} - {offerable} the AI can offer · {listings.length}/{MAX_LISTINGS.toLocaleString()} max</p>
        </div>
        <div className="wc-pagehead-actions">
          <button className="wc-primary" disabled={listings.length >= MAX_LISTINGS} onClick={() => setModal({ initial: null })}><Icon name="plus" size={16} />Add listing</button>
        </div>
      </div>

      {/* Listing search toggle - the AI only matches buyers to listings when ON. */}
      <div className="wc-card" style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", marginBottom: 18 }}>
        <span className="wc-kpi-icon" style={{ color: TONES.indigo.fg, background: TONES.indigo.bg }}><Icon name="sparkles" size={17} /></span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>AI listing search</div>
          <div style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
            {searchEnabled
              ? "On - the AI matches buyers to your active listings and offers them by area, budget and beds."
              : "Off - the AI never brings up or searches listings; it defers to you instead."}
          </div>
        </div>
        <Switch on={searchEnabled} onChange={(v) => searchMut.mutate(v)} title="Toggle AI listing search" />
      </div>

      {listings.length === 0 ? (
        <div className="wc-card" style={{ padding: 40, textAlign: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>No listings yet</div>
          <div style={{ fontSize: 13, color: "var(--ink-2)", marginBottom: 16 }}>Add your active properties so the AI can match them to buyers. With none, the AI simply defers to you.</div>
          <button className="wc-primary" onClick={() => setModal({ initial: null })}><Icon name="plus" size={16} />Add your first listing</button>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(228px, 1fr))", gap: 10 }}>
          {listings.map((l) => {
            const st = STATUSES.find((s) => s.value === l.status);
            // STATUSES uses "neutral" for sold/off-market, which the palette has
            // no key for - fall back to a muted grey.
            const tone = (st ? TONES[st.tone] : undefined) ?? { fg: "#6B7280", bg: "#F1F0EE" };
            const dim = l.enabled !== 1;
            return (
              <div className="wc-card" key={l.id} style={{ padding: 12, opacity: dim ? 0.6 : 1 }}>
                {l.images && l.images.length > 0 && (
                  <div style={{ position: "relative", margin: "-12px -12px 9px", height: 100, overflow: "hidden", borderTopLeftRadius: "inherit", borderTopRightRadius: "inherit" }}>
                    <img src={l.images[0].url} alt={l.address || "Listing"} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    {l.images.length > 1 && <span style={{ position: "absolute", bottom: 8, right: 8, fontSize: 11, fontWeight: 700, color: "#fff", background: "rgba(20,24,40,.6)", padding: "2px 8px", borderRadius: 99 }}><Icon name="layers" size={11} /> {l.images.length}</span>}
                  </div>
                )}
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.address || "Untitled listing"}</div>
                    <div style={{ fontSize: 12.5, color: "var(--ink-2)" }}>{[l.city, l.state, l.zip].filter(Boolean).join(", ") || "-"}</div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 99, color: tone.fg, background: tone.bg, flex: "none" }}>{st?.label || l.status}</span>
                </div>
                <div className="wc-mono" style={{ fontSize: 16, fontWeight: 800, margin: "7px 0 4px" }}>
                  {fmt$(l.price)}{l.listing_type === "rent" ? <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-3)" }}>/mo</span> : null}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, fontSize: 12, color: "var(--ink-2)", marginBottom: 10 }}>
                  <span><Icon name="home" size={12} /> {labelOf(PROPERTY_TYPES, l.property_type)}</span>
                  {l.bedrooms != null && <span>{l.bedrooms} bd</span>}
                  {l.bathrooms != null && <span>{l.bathrooms} ba</span>}
                  {l.square_feet != null && <span>{Number(l.square_feet).toLocaleString("en-US")} sqft</span>}
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid var(--line-soft)", paddingTop: 12 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 600, color: "var(--ink-3)", cursor: "pointer" }}>
                    <Switch on={l.enabled === 1} onChange={(v) => toggleEnabled.mutate({ id: l.id, enabled: v })} title="Visible to AI" />
                    {l.enabled === 1 ? "AI can offer" : "Hidden from AI"}
                  </label>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {l.url && <a className="wc-iconbtn-sm" href={l.url} target="_blank" rel="noreferrer" title="Open listing"><Icon name="arrowUpRight" size={15} /></a>}
                    <button className="wc-iconbtn-sm" title="Edit" onClick={() => setModal({ initial: l })}><Icon name="pencil" size={15} /></button>
                    <button className="wc-iconbtn-sm wc-danger" title="Remove" onClick={() => setConfirmDel(l)}><Icon name="trash" size={15} /></button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal && (
        <ListingModal
          initial={modal.initial}
          onClose={() => setModal(null)}
          onSave={(d) => { if (modal.initial) updateMut.mutate({ id: modal.initial.id, d }); else createMut.mutate(d); }}
        />
      )}

      {confirmDel && (
        <Wcv2Portal>
        <div className="wc-modal-scrim" onClick={() => setConfirmDel(null)}>
          <div className="wc-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="wc-card-h2" style={{ marginBottom: 8 }}>Remove listing?</div>
            <div className="wc-band-d" style={{ marginBottom: 18 }}>This deletes <strong>{confirmDel.address || "this listing"}</strong>. The AI will stop offering it.</div>
            <div className="wc-modal-foot">
              <button className="wc-ghostbtn" onClick={() => setConfirmDel(null)}>No, keep it</button>
              <button className="wc-primary" disabled={delMut.isPending} onClick={() => delMut.mutate(confirmDel.id)}><Icon name="trash" size={14} />Yes, remove</button>
            </div>
          </div>
        </div>
        </Wcv2Portal>
      )}
    </div>
  );
}
