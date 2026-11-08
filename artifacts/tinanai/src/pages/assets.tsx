import { useMemo, useState, type FormEvent } from 'react';
import { FolderKanban, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { Badge, Btn, Card, Empty, Field, Input, Modal, PageHeader, Select, Textarea } from '@/components/kit';
import { fmtDate, fmtMoney } from '@/lib/helpers';
import { now, uid, useWorkspace, type Asset } from '@/lib/store';
import { useToast } from '@/hooks/use-toast';
import { LocalizedTree, translateTemplate, translateUiText, useI18n } from '@/lib/i18n';

export const ASSET_TYPES = ['Application', 'Document', 'Brand', 'Media', 'Dataset', 'Intellectual property', 'Other'];
const STATUSES = ['Draft', 'Active', 'Archived'];
const blank = { name: '', type: 'Application', description: '', value: '0', status: 'Draft' };

export default function Assets() {
  const { locale } = useI18n();
  const { data, upsert, remove } = useWorkspace();
  const { toast } = useToast();
  const [q, setQ] = useState(''); const [ft, setFt] = useState('All'); const [fs, setFs] = useState('All');
  const [form, setForm] = useState<{ id?: string; v: typeof blank } | null>(null);
  const [detail, setDetail] = useState<Asset | null>(null);
  const list = useMemo(() => data.assets.filter((a) =>
    (ft === 'All' || a.type === ft) && (fs === 'All' || a.status === fs) && (`${a.name} ${a.description}`.toLowerCase().includes(q.toLowerCase()))), [data.assets, q, ft, fs]);

  const submit = (e: FormEvent) => {
    e.preventDefault(); if (!form) return;
    const old = data.assets.find((a) => a.id === form.id);
    upsert('assets', { id: form.id ?? uid(), name: form.v.name.trim(), type: form.v.type, description: form.v.description.trim(), value: Math.max(0, Number(form.v.value) || 0), status: form.v.status, createdAt: old?.createdAt ?? now() });
    toast({ title: form.id ? 'Asset updated' : 'Asset added' }); setForm(null);
  };
  const del = (a: Asset) => { if (window.confirm(translateTemplate('Delete {name}?', locale, { name: a.name }))) { remove('assets', a.id); setDetail(null); } };
  const edit = (a: Asset) => { setDetail(null); setForm({ id: a.id, v: { name: a.name, type: a.type, description: a.description, value: String(a.value), status: a.status } }); };
  const set = (k: keyof typeof blank, v: string) => setForm((f) => (f ? { ...f, v: { ...f.v, [k]: v } } : f));

  return (
    <LocalizedTree>
    <div>
      <PageHeader eyebrow="Digital Assets" title="Your catalogue" desc="Records are stored in this browser. Values are your own estimates, not market prices."
        action={<Btn variant="gold" onClick={() => setForm({ v: blank })} data-testid="button-add-asset"><Plus className="h-4 w-4" />Add asset</Btn>} />
      <div className="mb-5 grid gap-2 md:grid-cols-[1fr_180px_160px]">
        <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search assets" data-testid="input-search-assets" /></div>
        <Select value={ft} onChange={(e) => setFt(e.target.value)} data-testid="select-filter-type"><option>All</option>{ASSET_TYPES.map((t) => <option key={t}>{t}</option>)}</Select>
        <Select value={fs} onChange={(e) => setFs(e.target.value)} data-testid="select-filter-status"><option>All</option>{STATUSES.map((t) => <option key={t}>{t}</option>)}</Select>
      </div>
      {data.assets.length === 0 ? (
        <Empty icon={<FolderKanban className="h-5 w-5" />} title="No assets yet" desc="Add the apps, documents, brands and datasets you want to keep track of."><Btn variant="gold" onClick={() => setForm({ v: blank })} data-testid="button-add-asset-empty">Add your first asset</Btn></Empty>
      ) : list.length === 0 ? (
        <Empty icon={<Search className="h-5 w-5" />} title="No matches" desc="Nothing fits those filters."><Btn onClick={() => { setQ(''); setFt('All'); setFs('All'); }} data-testid="button-clear-filters">Clear filters</Btn></Empty>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {list.map((a) => (
            <Card key={a.id} data-testid={`card-asset-${a.id}`} className="group transition hover:-translate-y-0.5 hover:border-primary/50">
              <div className="flex items-start justify-between gap-2"><Badge tone="mute">{a.type}</Badge><Badge tone={a.status === 'Active' ? 'ok' : 'gold'}>{a.status}</Badge></div>
               <h3 data-no-translate className="mt-3 truncate font-serif text-2xl">{a.name}</h3>
               <p data-no-translate className="mt-1 line-clamp-2 min-h-[2.5rem] text-sm text-muted-foreground">{a.description || translateUiText('No description.', locale)}</p>
              <p className="mt-3 font-mono text-sm text-primary">{fmtMoney(a.value)}</p>
              <div className="mt-4 flex gap-2">
                <Btn size="sm" className="flex-1" onClick={() => setDetail(a)} data-testid={`button-detail-${a.id}`}>Details</Btn>
                <Btn size="sm" aria-label="Edit" onClick={() => edit(a)} data-testid={`button-edit-${a.id}`}><Pencil className="h-3.5 w-3.5" /></Btn>
                <Btn size="sm" variant="danger" aria-label="Delete" onClick={() => del(a)} data-testid={`button-delete-${a.id}`}><Trash2 className="h-3.5 w-3.5" /></Btn>
              </div>
            </Card>
          ))}
        </div>
      )}
      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? 'Edit asset' : 'New asset'}>
        {form && (
          <form onSubmit={submit} className="space-y-4">
            <Field label="Name"><Input required value={form.v.name} onChange={(e) => set('name', e.target.value)} data-testid="input-asset-name" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Type"><Select value={form.v.type} onChange={(e) => set('type', e.target.value)} data-testid="select-asset-type">{ASSET_TYPES.map((t) => <option key={t}>{t}</option>)}</Select></Field>
              <Field label="Status"><Select value={form.v.status} onChange={(e) => set('status', e.target.value)} data-testid="select-asset-status">{STATUSES.map((t) => <option key={t}>{t}</option>)}</Select></Field>
            </div>
            <Field label="Estimated value (USD)"><Input type="number" min="0" step="any" value={form.v.value} onChange={(e) => set('value', e.target.value)} data-testid="input-asset-value" /></Field>
            <Field label="Description"><Textarea rows={4} value={form.v.description} onChange={(e) => set('description', e.target.value)} data-testid="input-asset-description" /></Field>
            <div className="flex justify-end gap-2"><Btn type="button" onClick={() => setForm(null)} data-testid="button-cancel-asset">Cancel</Btn><Btn variant="gold" type="submit" data-testid="button-submit-asset">{form.id ? 'Save changes' : 'Add asset'}</Btn></div>
          </form>
        )}
      </Modal>
       <Modal open={!!detail} onClose={() => setDetail(null)} title={detail?.name ?? ''} data-no-translate-title>
        {detail && (
          <div className="space-y-4" data-testid="panel-asset-detail">
            <div className="flex gap-2"><Badge tone="mute">{detail.type}</Badge><Badge>{detail.status}</Badge></div>
             <p data-no-translate className="whitespace-pre-wrap text-sm text-muted-foreground">{detail.description || translateUiText('No description.', locale)}</p>
            <dl className="grid grid-cols-2 gap-3 text-sm"><div><dt className="text-[11px] uppercase tracking-wider text-muted-foreground">Estimated value</dt><dd className="font-mono text-primary">{fmtMoney(detail.value)}</dd></div>
              <div><dt className="text-[11px] uppercase tracking-wider text-muted-foreground">Added</dt><dd>{fmtDate(detail.createdAt)}</dd></div></dl>
            <div className="flex justify-end gap-2"><Btn onClick={() => edit(detail)} data-testid="button-detail-edit"><Pencil className="h-4 w-4" />Edit</Btn><Btn variant="danger" onClick={() => del(detail)} data-testid="button-detail-delete"><Trash2 className="h-4 w-4" />Delete</Btn></div>
          </div>
        )}
      </Modal>
    </div>
    </LocalizedTree>
  );
}
