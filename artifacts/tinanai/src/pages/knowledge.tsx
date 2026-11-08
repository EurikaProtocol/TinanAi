import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'wouter';
import { useAuth } from '@clerk/react';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, BookOpen, Check, ChevronRight, CircleHelp, FileArchive,
  FileCode2, FileText, FolderPlus, LockKeyhole, MessageSquareText, MoreHorizontal,
  Plus, RefreshCw, Search, Send, ShieldCheck, Sparkles, Trash2, Upload, X,
} from 'lucide-react';
import {
  getGetKnowledgeDocumentQueryKey,
  getListKnowledgeCollectionsQueryKey,
  getListKnowledgeDocumentsQueryKey,
  useAskKnowledge,
  useCreateKnowledgeCollection,
  useDeleteKnowledgeCollection,
  useDeleteKnowledgeDocument,
  useGetKnowledgeDocument,
  useListKnowledgeCollections,
  useListKnowledgeDocuments,
  useReindexKnowledgeDocument,
  useSearchKnowledge,
  useUpdateKnowledgeCollection,
  useUpdateKnowledgeDocument,
  useUploadKnowledgeDocument,
} from '@workspace/api-client-react';
import type {
  KnowledgeCategory,
  KnowledgeCollection,
  KnowledgeDocument,
  KnowledgeSource,
} from '@workspace/api-client-react';
import { Btn, Empty, Input, Select, Textarea } from '@/components/kit';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { LocalizedTree, getCurrentLocale, translateTemplate, useI18n } from '@/lib/i18n';

const categories: { value: KnowledgeCategory; label: string }[] = [
  { value: 'ai_engineering', label: 'AI engineering' },
  { value: 'blockchain_solidity', label: 'Blockchain & Solidity' },
  { value: 'ethereum_standards', label: 'Ethereum standards' },
  { value: 'web3_architecture', label: 'Web3 architecture' },
  { value: 'crypto_tokenomics', label: 'Crypto tokenomics' },
  { value: 'renewable_tokenization', label: 'Renewable tokenization' },
  { value: 'regulatory', label: 'Regulatory' },
  { value: 'general', label: 'General' },
];

const categoryName = (category: KnowledgeCategory) => categories.find((item) => item.value === category)?.label ?? 'General';
const bytesLabel = (bytes: number) => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
const dateLabel = (date: string) => new Intl.DateTimeFormat(getCurrentLocale(), { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(date));
const docIcon = (format: string) => format === 'zip' ? FileArchive : format === 'code' ? FileCode2 : FileText;
const categoryKey = (value: string) => value === 'all' ? undefined : value as KnowledgeCategory;
const humanizeStatus = (status: string) => status.charAt(0).toUpperCase() + status.slice(1);

function KnowledgeSkeleton() {
  return (
    <LocalizedTree>
    <div className="space-y-5" aria-label="Loading your library" data-testid="state-knowledge-loading">
      <div className="knowledge-skeleton h-36 rounded-2xl" />
      <div className="grid gap-5 lg:grid-cols-[230px_minmax(0,1fr)]">
        <div className="knowledge-skeleton h-96 rounded-2xl" />
        <div className="space-y-3">{[0, 1, 2].map((item) => <div key={item} className="knowledge-skeleton h-24 rounded-xl" />)}</div>
      </div>
    </div>
    </LocalizedTree>
  );
}

function SourceReference({ source, index }: { source: KnowledgeSource; index?: number }) {
  const { locale } = useI18n();
  const location = source.pageStart !== null && source.pageStart !== undefined
    ? `Page ${source.pageEnd && source.pageEnd !== source.pageStart ? `${source.pageStart}–${source.pageEnd}` : source.pageStart}`
    : source.section || null;
  return (
    <LocalizedTree>
    <article className="rounded-xl border border-border/80 bg-slate-950/30 p-4" data-testid={`source-citation-${source.chunkId}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
           <p className="text-[10px] font-bold uppercase tracking-[.16em] text-primary">{index ? translateTemplate('Source {index}', locale, { index }) : 'Matched excerpt'}</p>
           <h4 data-no-translate className="mt-1 truncate text-sm font-semibold text-foreground">{source.title}</h4>
            <p data-no-translate className="mt-1 text-[11px] text-muted-foreground">{source.filename}{location && <> <span className="mx-1.5 text-border">/</span> {location}</>}</p>
        </div>
        <span className="rounded-full border border-primary/20 bg-primary/5 px-2 py-1 font-mono text-[10px] text-primary" data-testid={`text-source-score-${source.chunkId}`}>{Math.round(source.score * 100)}% match</span>
      </div>
      <p data-no-translate className="mt-3 whitespace-pre-wrap text-xs leading-6 text-foreground/80">{source.excerpt}</p>
    </article>
    </LocalizedTree>
  );
}

export default function Knowledge() {
  const { locale } = useI18n();
  const { isLoaded, isSignedIn, userId } = useAuth();
  const queryClient = useQueryClient();
  const documentsQuery = useListKnowledgeDocuments({
    query: { enabled: isLoaded && !!isSignedIn, queryKey: getListKnowledgeDocumentsQueryKey(), refetchInterval: 8000 },
  });
  const collectionsQuery = useListKnowledgeCollections({
    query: { enabled: isLoaded && !!isSignedIn, queryKey: getListKnowledgeCollectionsQueryKey() },
  });
  const documents = documentsQuery.data?.documents ?? [];
  const collections = collectionsQuery.data?.collections ?? [];
  const uploadDocument = useUploadKnowledgeDocument();
  const updateDocument = useUpdateKnowledgeDocument();
  const deleteDocument = useDeleteKnowledgeDocument();
  const reindexDocument = useReindexKnowledgeDocument();
  const createCollection = useCreateKnowledgeCollection();
  const updateCollection = useUpdateKnowledgeCollection();
  const deleteCollection = useDeleteKnowledgeCollection();
  const searchKnowledge = useSearchKnowledge();
  const askKnowledge = useAskKnowledge();

  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedCollection, setSelectedCollection] = useState<string | undefined>();
  const [librarySearch, setLibrarySearch] = useState('');
  const [searchCategory, setSearchCategory] = useState('all');
  const [searchResults, setSearchResults] = useState<KnowledgeSource[] | null>(null);
  const [askCategory, setAskCategory] = useState('all');
  const [askAnswer, setAskAnswer] = useState<{ answer: string; citations: KnowledgeSource[]; insufficientEvidence: boolean } | null>(null);
  const [askHistory, setAskHistory] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadCollections, setUploadCollections] = useState<string[]>([]);
  const [collectionOpen, setCollectionOpen] = useState(false);
  const [editingCollection, setEditingCollection] = useState<KnowledgeCollection | null>(null);
  const [detailCategory, setDetailCategory] = useState<KnowledgeCategory>('general');
  const [detailCollections, setDetailCollections] = useState<string[]>([]);
  const uploadForm = useForm<{ category: KnowledgeCategory }>({ defaultValues: { category: 'general' } });
  const collectionForm = useForm<{ name: string; description: string }>({ defaultValues: { name: '', description: '' } });
  const searchForm = useForm<{ query: string }>({ defaultValues: { query: '' } });
  const askForm = useForm<{ query: string }>({ defaultValues: { query: '' } });
  const { reset: resetUploadForm } = uploadForm;
  const { reset: resetCollectionForm } = collectionForm;
  const { reset: resetSearchForm } = searchForm;
  const { reset: resetAskForm } = askForm;
  const previousUserId = useRef<string | null | undefined>(undefined);
  const detailQuery = useGetKnowledgeDocument(selectedDocumentId ?? '', {
    query: { enabled: !!selectedDocumentId && !!isSignedIn, queryKey: getGetKnowledgeDocumentQueryKey(selectedDocumentId ?? '') },
  });
  const detailDocument = detailQuery.data?.document;

  useEffect(() => {
    if (previousUserId.current !== undefined && previousUserId.current !== (userId ?? null)) {
      setSelectedCategory('all');
      setSelectedCollection(undefined);
      setLibrarySearch('');
      setSearchCategory('all');
      setSearchResults(null);
      setAskCategory('all');
      setAskAnswer(null);
      setAskHistory([]);
      setSelectedDocumentId(null);
      setUploadFile(null);
      setUploadCollections([]);
      setCollectionOpen(false);
      setEditingCollection(null);
      resetUploadForm({ category: 'general' });
      resetCollectionForm({ name: '', description: '' });
      resetSearchForm({ query: '' });
      resetAskForm({ query: '' });
    }
    previousUserId.current = userId ?? null;
  }, [userId, resetUploadForm, resetCollectionForm, resetSearchForm, resetAskForm]);

  useEffect(() => {
    if (detailDocument) {
      setDetailCategory(detailDocument.category);
      setDetailCollections(detailDocument.collections.map((item) => item.id));
    }
  }, [detailDocument]);

  const filteredDocuments = useMemo(() => documents.filter((document) => {
    const term = librarySearch.trim().toLocaleLowerCase();
    return (selectedCategory === 'all' || document.category === selectedCategory)
      && (!selectedCollection || document.collections.some((collection) => collection.id === selectedCollection))
      && (!term || `${document.title} ${document.filename} ${document.collections.map((collection) => collection.name).join(' ')}`.toLocaleLowerCase().includes(term));
  }), [documents, librarySearch, selectedCategory, selectedCollection]);

  const invalidateLibrary = () => {
    void queryClient.invalidateQueries({ queryKey: getListKnowledgeDocumentsQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getListKnowledgeCollectionsQueryKey() });
    if (selectedDocumentId) void queryClient.invalidateQueries({ queryKey: getGetKnowledgeDocumentQueryKey(selectedDocumentId) });
  };

  const handleUpload = () => {
    if (!uploadFile) return;
    uploadDocument.mutate({ data: { file: uploadFile, category: uploadForm.getValues('category'), collectionIds: uploadCollections } }, {
      onSuccess: () => {
        invalidateLibrary();
        setUploadOpen(false);
        setUploadFile(null);
        setUploadCollections([]);
        uploadForm.reset({ category: 'general' });
      },
    });
  };

  const handleCreateCollection = (values: { name: string; description: string }) => {
    if (!values.name.trim()) return;
    const data = { name: values.name.trim(), description: values.description.trim() || null };
    if (editingCollection) {
      updateCollection.mutate({ id: editingCollection.id, data }, {
        onSuccess: () => { invalidateLibrary(); setCollectionOpen(false); collectionForm.reset(); },
      });
    } else {
      createCollection.mutate({ data }, {
        onSuccess: () => { invalidateLibrary(); setCollectionOpen(false); collectionForm.reset(); },
      });
    }
  };

  const openCollectionEditor = (collection?: KnowledgeCollection) => {
    setEditingCollection(collection ?? null);
    collectionForm.reset({ name: collection?.name ?? '', description: collection?.description ?? '' });
    setCollectionOpen(true);
  };

  const handleSearch = (values: { query: string }) => {
    const query = values.query.trim();
    if (query.length < 2) return;
    searchKnowledge.mutate({ data: { query, category: categoryKey(searchCategory), collectionId: selectedCollection, limit: 8 } }, {
      onSuccess: (response) => setSearchResults(response.results),
    });
  };

  const handleAsk = (values: { query: string }) => {
    const query = values.query.trim();
    if (query.length < 2) return;
    askKnowledge.mutate({ data: { query, category: categoryKey(askCategory), collectionId: selectedCollection, history: askHistory.slice(-6), language: locale } }, {
      onSuccess: (response) => {
        setAskAnswer(response);
        setAskHistory((prior) => [...prior, { role: 'user' as const, content: query }, { role: 'assistant' as const, content: response.answer }].slice(-6));
        askForm.reset({ query: '' });
      },
    });
  };

  const saveDocumentMetadata = () => {
    if (!selectedDocumentId) return;
    updateDocument.mutate({ id: selectedDocumentId, data: { category: detailCategory, collectionIds: detailCollections } }, {
      onSuccess: invalidateLibrary,
    });
  };

  const documentCount = documents.length;
  const readyCount = documents.filter((item) => item.status === 'ready').length;

  if (!isLoaded) return <KnowledgeSkeleton />;
  if (!isSignedIn) {
    return (
      <LocalizedTree>
      <main className="mx-auto max-w-4xl py-8 sm:py-14" data-testid="knowledge-signed-out">
        <section className="knowledge-panel knowledge-grid relative overflow-hidden rounded-[1.7rem] border border-slate-600/50 px-6 py-10 sm:px-12 sm:py-14">
          <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 h-80 w-80 rounded-full bg-cyan-400/[.08] blur-[80px]" />
          <div className="relative max-w-2xl">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 text-primary"><BookOpen className="h-5 w-5" /></div>
            <p className="mt-8 text-[10px] font-bold uppercase tracking-[.24em] text-primary">TINANAI · Research workspace</p>
            <h1 className="mt-4 max-w-xl text-4xl font-extrabold leading-[1.03] tracking-[-.055em] text-slate-50 sm:text-6xl">A library that shows its work.</h1>
            <p className="mt-5 max-w-xl text-sm leading-7 text-slate-300">Keep technical sources together, ask questions against your own material, and follow every answer back to its excerpt.</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/sign-in" data-testid="link-knowledge-sign-in" className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-bold text-primary-foreground transition hover:-translate-y-0.5">Sign in to your library <ChevronRight className="h-4 w-4" /></Link>
              <Link href="/sign-up" data-testid="link-knowledge-sign-up" className="inline-flex h-11 items-center justify-center rounded-lg border border-slate-500/60 bg-slate-900/60 px-5 text-sm font-semibold text-slate-100 transition hover:border-primary/50">Create account</Link>
            </div>
            <div className="mt-10 grid gap-3 border-t border-slate-700/70 pt-6 sm:grid-cols-3">
              <div><ShieldCheck className="h-4 w-4 text-cyan-200" /><p className="mt-2 text-xs font-semibold text-slate-100">Private to your account</p><p className="mt-1 text-[11px] leading-5 text-slate-400">Library records are stored server-side, separately from your browser workspace.</p></div>
              <div><Search className="h-4 w-4 text-cyan-200" /><p className="mt-2 text-xs font-semibold text-slate-100">Searchable excerpts</p><p className="mt-1 text-[11px] leading-5 text-slate-400">Only extracted, secret-redacted text chunks are retained—not uploaded originals.</p></div>
              <div><MessageSquareText className="h-4 w-4 text-cyan-200" /><p className="mt-2 text-xs font-semibold text-slate-100">Answers with receipts</p><p className="mt-1 text-[11px] leading-5 text-slate-400">Responses surface retrieved passages with the references provided by the source.</p></div>
            </div>
          </div>
        </section>
      </main>
      </LocalizedTree>
    );
  }

  if (documentsQuery.isLoading || collectionsQuery.isLoading) return <KnowledgeSkeleton />;
  if (documentsQuery.isError || collectionsQuery.isError) {
    return (
      <LocalizedTree>
      <div className="mx-auto max-w-3xl py-12" role="alert" data-testid="state-knowledge-error">
        <Empty icon={<AlertTriangle className="h-5 w-5" />} title="The library did not load" desc="Your account data is still private. Try the request again in a moment.">
          <Btn onClick={() => { void documentsQuery.refetch(); void collectionsQuery.refetch(); }} data-testid="button-retry-library"><RefreshCw className="h-4 w-4" />Try again</Btn>
        </Empty>
      </div>
      </LocalizedTree>
    );
  }

  return (
    <LocalizedTree>
    <div className="space-y-8" data-testid="page-knowledge">
      <section className="knowledge-panel knowledge-grid relative overflow-hidden rounded-[1.5rem] border border-slate-600/45 px-5 py-7 sm:px-8 sm:py-9">
        <div aria-hidden className="pointer-events-none absolute -right-20 -top-36 h-96 w-96 rounded-full bg-cyan-400/[.07] blur-[90px]" />
        <div className="relative flex flex-col justify-between gap-6 xl:flex-row xl:items-end">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.22em] text-primary"><BookOpen className="h-3.5 w-3.5" /> Account knowledge base</div>
            <h1 className="mt-4 text-4xl font-extrabold leading-[.98] tracking-[-.06em] text-slate-50 sm:text-5xl">Research, with its sources attached.</h1>
            <p className="mt-4 max-w-xl text-sm leading-6 text-slate-300/80">Build a private technical library. Search indexed passages or ask a question grounded in the sources you’ve added.</p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="mr-2 hidden pb-2 text-right sm:block"><p className="font-mono text-xl font-medium text-slate-100">{readyCount}<span className="text-slate-500"> / {documentCount}</span></p><p className="text-[9px] font-bold uppercase tracking-[.17em] text-slate-400">sources ready</p></div>
            <Btn variant="outline" onClick={() => openCollectionEditor()} data-testid="button-create-collection"><FolderPlus className="h-4 w-4" />New collection</Btn>
            <Btn variant="gold" onClick={() => setUploadOpen(true)} data-testid="button-open-upload"><Upload className="h-4 w-4" />Add sources</Btn>
          </div>
        </div>
        <div className="relative mt-6 flex flex-wrap gap-x-5 gap-y-2 border-t border-slate-700/60 pt-4 text-[10px] leading-5 text-slate-400">
          <span className="inline-flex items-center gap-1.5"><LockKeyhole className="h-3 w-3 text-cyan-200" /> Account-scoped storage</span>
          <span>Original file bytes are not retained.</span>
          <button type="button" className="inline-flex items-center gap-1 text-cyan-100 hover:text-white" data-testid="button-privacy-details" onClick={() => document.getElementById('knowledge-privacy')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>How processing works <ChevronRight className="h-3 w-3" /></button>
        </div>
      </section>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(350px,.83fr)]">
        <section className="min-w-0 space-y-4" aria-label="Library sources">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div><p className="text-[10px] font-bold uppercase tracking-[.2em] text-primary/90">Your collection</p><h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-100">Sources <span className="font-mono text-base font-medium text-slate-500">{filteredDocuments.length}</span></h2></div>
            <label className="relative w-full sm:max-w-[280px]"><span className="sr-only">Search your sources</span><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" /><Input value={librarySearch} onChange={(event) => setLibrarySearch(event.target.value)} placeholder="Filter by title or filename" className="h-10 pl-9" data-testid="input-library-filter" /></label>
          </div>
          <div className="grid gap-4 md:grid-cols-[190px_minmax(0,1fr)]">
            <aside className="knowledge-surface rounded-xl border border-border/80 p-3" aria-label="Library filters">
              <p className="px-2 py-2 text-[9px] font-bold uppercase tracking-[.18em] text-muted-foreground">Categories</p>
              <button type="button" onClick={() => setSelectedCategory('all')} aria-pressed={selectedCategory === 'all'} data-testid="filter-category-all" className={`flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-xs transition ${selectedCategory === 'all' ? 'bg-primary/10 font-semibold text-primary' : 'text-slate-300 hover:bg-secondary/70'}`}><span>All categories</span><span className="font-mono text-[10px]">{documents.length}</span></button>
              {categories.map((category) => {
                const count = documents.filter((document) => document.category === category.value).length;
                return <button key={category.value} type="button" onClick={() => setSelectedCategory(category.value)} aria-pressed={selectedCategory === category.value} data-testid={`filter-category-${category.value}`} className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left text-[11px] transition ${selectedCategory === category.value ? 'bg-primary/10 font-semibold text-primary' : 'text-slate-400 hover:bg-secondary/70 hover:text-slate-200'}`}><span>{category.label}</span><span className="font-mono text-[9px] text-slate-500">{count}</span></button>;
              })}
              <div className="my-3 border-t border-border/70" />
              <div className="flex items-center justify-between px-2 py-2"><p className="text-[9px] font-bold uppercase tracking-[.18em] text-muted-foreground">Collections</p><button type="button" onClick={() => openCollectionEditor()} aria-label="Create collection" data-testid="button-add-collection-shortcut" className="rounded p-1 text-slate-500 hover:bg-secondary hover:text-primary"><Plus className="h-3.5 w-3.5" /></button></div>
              <button type="button" onClick={() => setSelectedCollection(undefined)} aria-pressed={!selectedCollection} data-testid="filter-collection-all" className={`flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-xs transition ${!selectedCollection ? 'bg-primary/10 font-semibold text-primary' : 'text-slate-300 hover:bg-secondary/70'}`}><span>All sources</span><span className="font-mono text-[10px]">{documents.length}</span></button>
              {collections.map((collection) => (
                <div key={collection.id} className="group flex items-center gap-1">
                  <button type="button" onClick={() => setSelectedCollection(collection.id)} aria-pressed={selectedCollection === collection.id} data-testid={`filter-collection-${collection.id}`} className={`flex min-w-0 flex-1 items-center justify-between gap-1 rounded-lg px-2 py-2 text-left text-[11px] transition ${selectedCollection === collection.id ? 'bg-primary/10 font-semibold text-primary' : 'text-slate-400 hover:bg-secondary/70 hover:text-slate-200'}`}><span className="truncate">{collection.name}</span><span className="font-mono text-[9px] text-slate-500">{collection.documentCount}</span></button>
                  <button type="button" aria-label={`Edit ${collection.name}`} onClick={() => openCollectionEditor(collection)} data-testid={`button-edit-collection-${collection.id}`} className="rounded p-1 text-slate-600 opacity-0 transition hover:text-primary group-hover:opacity-100 focus:opacity-100"><MoreHorizontal className="h-4 w-4" /></button>
                </div>
              ))}
            </aside>

            <div className="min-w-0 space-y-2">
              {documentsQuery.isFetching && documents.length > 0 && <div className="flex items-center gap-2 px-1 text-[10px] text-muted-foreground" role="status" data-testid="status-library-refresh"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />Updating source status</div>}
              {filteredDocuments.length === 0 ? (
                librarySearch || selectedCollection || selectedCategory !== 'all' ? (
                  <div className="rounded-xl border border-dashed border-border px-5 py-10 text-center" data-testid="state-library-no-matches"><Search className="mx-auto h-5 w-5 text-muted-foreground" /><h3 className="mt-3 text-sm font-semibold">No matching sources</h3><p className="mt-1 text-xs text-muted-foreground">Try another search or clear your filters.</p><Btn size="sm" className="mt-4" onClick={() => { setLibrarySearch(''); setSelectedCategory('all'); setSelectedCollection(undefined); }} data-testid="button-clear-library-filters">Clear filters</Btn></div>
                ) : (
                  <div className="rounded-xl border border-dashed border-border bg-slate-950/20 px-5 py-10 text-center" data-testid="state-library-empty"><div className="mx-auto grid h-11 w-11 place-items-center rounded-xl border border-primary/25 bg-primary/5 text-primary"><FileText className="h-5 w-5" /></div><h3 className="mt-3 text-base font-semibold text-slate-100">Your sources start here</h3><p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-muted-foreground">Add technical PDFs, documents, notes, code or data files. We’ll index extracted text for private search and grounded answers.</p><Btn variant="gold" size="sm" className="mt-4" onClick={() => setUploadOpen(true)} data-testid="button-upload-first-source"><Upload className="h-3.5 w-3.5" />Add your first source</Btn></div>
                )
              ) : filteredDocuments.map((document) => {
                const Icon = docIcon(document.format);
                const statusTone = document.status === 'ready' ? 'border-emerald-300/25 bg-emerald-300/[.06] text-emerald-200' : document.status === 'error' ? 'border-rose-300/25 bg-rose-300/[.06] text-rose-200' : 'border-amber-200/25 bg-amber-200/[.06] text-amber-100';
                return (
                  <article key={document.id} className="group rounded-xl border border-border/80 bg-card/70 p-4 transition hover:border-primary/35 hover:bg-card sm:p-4" data-testid={`card-source-${document.id}`}>
                    <div className="flex items-start gap-3">
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-slate-600/60 bg-slate-950/50 text-cyan-100"><Icon className="h-4 w-4" /></div>
                      <button type="button" onClick={() => setSelectedDocumentId(document.id)} data-testid={`button-open-source-${document.id}`} className="min-w-0 flex-1 text-left">
                        <div className="flex flex-wrap items-center gap-2"><h3 className="max-w-full truncate text-sm font-semibold text-slate-100 group-hover:text-cyan-50">{document.title}</h3><span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-[.1em] ${statusTone}`} data-testid={`status-source-${document.id}`}>{humanizeStatus(document.status)}</span></div>
                        <p className="mt-1 truncate text-[11px] text-slate-400">{document.filename}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-500"><span>{categoryName(document.category)}</span><span>{bytesLabel(document.sizeBytes)}</span><span>{document.chunkCount} chunks</span>{document.pageCount !== null && <span>{document.pageCount} pages</span>}</div>
                        {document.collections.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{document.collections.map((collection) => <span key={collection.id} className="rounded border border-violet-300/15 bg-violet-300/[.05] px-1.5 py-0.5 text-[9px] text-violet-100/80">{collection.name}</span>)}</div>}
                      </button>
                      <button type="button" aria-label={`Open source details for ${document.title}`} onClick={() => setSelectedDocumentId(document.id)} data-testid={`button-source-details-${document.id}`} className="rounded-md p-1.5 text-slate-500 transition hover:bg-secondary hover:text-primary"><ChevronRight className="h-4 w-4" /></button>
                    </div>
                    {(document.warning || document.errorMessage) && <div className={`mt-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-[10px] leading-5 ${document.errorMessage ? 'border-rose-400/20 bg-rose-950/20 text-rose-200' : 'border-amber-300/20 bg-amber-950/15 text-amber-100/80'}`}><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /><span>{document.errorMessage || document.warning}</span></div>}
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <aside className="space-y-5">
          <section className="overflow-hidden rounded-2xl border border-primary/20 bg-[#0b1728]/95 shadow-[0_20px_70px_rgba(1,8,20,.24)]" aria-label="Ask your library">
            <div className="border-b border-slate-700/70 bg-[linear-gradient(115deg,rgba(43,184,198,.1),transparent_62%)] px-5 py-4">
              <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.2em] text-cyan-100"><Sparkles className="h-3.5 w-3.5" /> Grounded answers</p>
              <h2 className="mt-2 text-xl font-bold tracking-tight text-slate-100">Ask your sources</h2>
              <p className="mt-1 text-[11px] leading-5 text-slate-400">Answers use retrieved excerpts, not the whole library.</p>
            </div>
            <div className="space-y-4 p-4 sm:p-5">
              {askAnswer && <div className="space-y-3" data-testid="panel-ask-answer">
                <div className="rounded-xl border border-slate-700/80 bg-slate-950/40 p-4">
                  <p className="whitespace-pre-wrap text-sm leading-6 text-slate-200" data-testid="text-grounded-answer">{askAnswer.answer}</p>
                  {askAnswer.insufficientEvidence && <p className="mt-3 flex items-start gap-2 border-t border-slate-700/70 pt-3 text-[11px] leading-5 text-amber-100/80" data-testid="notice-insufficient-evidence"><CircleHelp className="mt-0.5 h-3.5 w-3.5 shrink-0" />The sources did not provide enough evidence for a confident answer.</p>}
                </div>
                {askAnswer.citations.length > 0 ? <div className="space-y-2"><p className="text-[9px] font-bold uppercase tracking-[.16em] text-slate-500">Evidence returned</p>{askAnswer.citations.map((source, index) => <SourceReference key={source.chunkId} source={source} index={index + 1} />)}</div> : <p className="text-[11px] text-slate-500" data-testid="text-no-citations">No source excerpts were returned for this answer.</p>}
              </div>}
              {askKnowledge.isError && <div role="alert" className="rounded-lg border border-rose-300/20 bg-rose-950/20 p-3 text-xs text-rose-200" data-testid="state-ask-error">The question could not be answered right now. Please try again.</div>}
              <Form {...askForm}><form onSubmit={askForm.handleSubmit(handleAsk)} className="space-y-2">
                <FormField control={askForm.control} name="query" rules={{ required: 'Enter a question.', minLength: { value: 2, message: 'Use at least two characters.' }, maxLength: { value: 1000, message: 'Keep the question under 1,000 characters.' } }} render={({ field }) => <FormItem><FormLabel className="sr-only">Ask a question about your sources</FormLabel><FormControl><Textarea {...field} placeholder="What do the standards say about…?" maxLength={1000} rows={3} className="min-h-[92px] border-slate-700 bg-slate-950/45 text-xs" data-testid="input-ask-knowledge" /></FormControl><FormMessage /></FormItem>} />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Select aria-label="Limit question to category" value={askCategory} onChange={(event) => setAskCategory(event.target.value)} className="h-8 w-auto min-w-[135px] border-slate-700 bg-slate-950/50 text-[10px]" data-testid="select-ask-category"><option value="all">All categories</option>{categories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</Select>
                  <Btn variant="gold" size="sm" type="submit" disabled={(askForm.watch('query') ?? '').trim().length < 2 || askKnowledge.isPending} data-testid="button-ask-knowledge">{askKnowledge.isPending ? 'Checking sources' : <>Ask <Send className="h-3.5 w-3.5" /></>}</Btn>
                </div>
              </form></Form>
              {!askAnswer && <div className="rounded-lg border border-slate-700/60 bg-slate-950/25 px-3 py-2.5 text-[10px] leading-5 text-slate-500"><ShieldCheck className="mr-1.5 inline h-3 w-3 text-cyan-200/70" />Only retrieved excerpts are sent to the existing OpenAI chat integration.</div>}
            </div>
          </section>

          <section className="knowledge-surface rounded-2xl border border-border/80 p-4 sm:p-5" aria-label="Semantic search">
            <div className="flex items-start justify-between gap-4"><div><p className="text-[9px] font-bold uppercase tracking-[.2em] text-violet-200/80">Find an exact passage</p><h2 className="mt-1 text-lg font-bold text-slate-100">Search the library</h2></div><Search className="mt-1 h-4 w-4 text-violet-200" /></div>
            <Form {...searchForm}><form onSubmit={searchForm.handleSubmit(handleSearch)} className="mt-4 space-y-2.5">
              <FormField control={searchForm.control} name="query" rules={{ required: 'Enter search terms.', minLength: { value: 2, message: 'Use at least two characters.' }, maxLength: { value: 1000, message: 'Keep the search under 1,000 characters.' } }} render={({ field }) => <FormItem><FormLabel className="sr-only">Search for concepts or keywords</FormLabel><div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" /><FormControl><Input {...field} placeholder="Search concepts, terms, clauses…" maxLength={1000} className="pl-9" data-testid="input-search-knowledge" /></FormControl></div><FormMessage /></FormItem>} />
              <div className="flex gap-2"><Select aria-label="Search category" value={searchCategory} onChange={(event) => setSearchCategory(event.target.value)} className="h-9 flex-1 text-[10px]" data-testid="select-search-category"><option value="all">All categories</option>{categories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</Select><Btn variant="outline" size="sm" type="submit" disabled={(searchForm.watch('query') ?? '').trim().length < 2 || searchKnowledge.isPending} data-testid="button-search-knowledge">{searchKnowledge.isPending ? 'Searching' : 'Search'}</Btn></div>
            </form></Form>
            {searchKnowledge.isError && <p role="alert" className="mt-3 text-xs text-rose-200" data-testid="state-search-error">Search is temporarily unavailable. Try again.</p>}
            {searchResults && <div className="mt-4 space-y-2" data-testid="list-search-results">{searchResults.length > 0 ? <>{searchResults.map((source, index) => <SourceReference key={source.chunkId} source={source} index={index + 1} />)}</> : <div className="rounded-lg border border-dashed border-border px-4 py-5 text-center"><p className="text-xs font-semibold text-slate-200">No passages found</p><p className="mt-1 text-[10px] text-muted-foreground">Try a broader phrase or another category.</p></div>}</div>}
          </section>

          <section id="knowledge-privacy" className="rounded-xl border border-slate-700/70 bg-slate-950/25 p-4" aria-label="Processing and storage details">
            <h2 className="flex items-center gap-2 text-xs font-bold text-slate-200"><LockKeyhole className="h-3.5 w-3.5 text-cyan-200" />What happens to your sources</h2>
            <ul className="mt-3 space-y-2 text-[10px] leading-5 text-slate-400">
              <li>Original uploaded file bytes are not retained. Extracted, secret-redacted text chunks, source metadata and embeddings are stored in PostgreSQL.</li>
              <li>The local <code className="font-mono text-cyan-100/80">Xenova/all-MiniLM-L6-v2</code> embedding model runs with document text local to the API.</li>
              <li>When you ask, only the retrieved excerpts are sent to the existing OpenAI chat integration.</li>
              <li>References are shown only when supplied by the source. We do not create page numbers or section labels.</li>
            </ul>
          </section>
        </aside>
      </div>

      {uploadOpen && <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/75 p-0 backdrop-blur-sm sm:items-center sm:p-5" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setUploadOpen(false); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="upload-title" className="knowledge-panel max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-2xl border border-slate-600/70 p-5 shadow-2xl sm:rounded-2xl sm:p-6" data-testid="dialog-upload-source">
          <div className="flex items-start justify-between gap-3"><div><p className="text-[9px] font-bold uppercase tracking-[.2em] text-primary">Add to your account library</p><h2 id="upload-title" className="mt-1 text-xl font-bold text-slate-100">Upload a source</h2></div><button type="button" aria-label="Close upload dialog" onClick={() => setUploadOpen(false)} data-testid="button-close-upload" className="rounded-md p-1.5 text-slate-400 hover:bg-secondary hover:text-white"><X className="h-4 w-4" /></button></div>
          <Form {...uploadForm}><form onSubmit={uploadForm.handleSubmit(handleUpload)} className="mt-5 space-y-4">
            <label className="block rounded-xl border border-dashed border-slate-600 bg-slate-950/30 p-5 text-center transition hover:border-primary/50">
              <Upload className="mx-auto h-5 w-5 text-cyan-100" /><span className="mt-2 block text-sm font-semibold text-slate-100">{uploadFile ? uploadFile.name : 'Choose a source file'}</span><span className="mt-1 block text-[10px] leading-5 text-slate-500">PDF, DOCX, TXT, Markdown, JSON, CSV, code or ZIP</span>
              <input type="file" className="sr-only" accept=".pdf,.docx,.txt,.md,.markdown,.json,.csv,.zip,.py,.js,.ts,.tsx,.jsx,.sol,.rs,.go,.java,.c,.cpp,.h,.html,.css,.yaml,.yml,.toml,.xml,.sql" onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)} data-testid="input-upload-file" />
            </label>
            <FormField control={uploadForm.control} name="category" render={({ field }) => <FormItem><FormLabel className="text-[10px] font-bold uppercase tracking-[.16em] text-muted-foreground">Category</FormLabel><FormControl><Select {...field} data-testid="select-upload-category">{categories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</Select></FormControl><FormMessage /></FormItem>} />
            {collections.length > 0 && <fieldset className="space-y-2"><legend className="text-[10px] font-bold uppercase tracking-[.16em] text-muted-foreground">Collections</legend><div className="grid gap-2 sm:grid-cols-2">{collections.map((collection) => <label key={collection.id} className="flex items-center gap-2 rounded-lg border border-border/70 bg-slate-950/20 px-3 py-2 text-xs text-slate-300"><input type="checkbox" checked={uploadCollections.includes(collection.id)} onChange={(event) => setUploadCollections((prior) => event.target.checked ? [...prior, collection.id] : prior.filter((id) => id !== collection.id))} data-testid={`checkbox-upload-collection-${collection.id}`} className="accent-cyan-300" />{collection.name}</label>)}</div></fieldset>}
            <div className="rounded-lg border border-amber-300/15 bg-amber-950/15 px-3 py-2.5 text-[10px] leading-5 text-amber-100/75"><ShieldCheck className="mr-1.5 inline h-3 w-3" />Original file bytes are not retained. Extracted text is secret-redacted before indexing.</div>
            {uploadDocument.isError && <p role="alert" className="text-xs text-rose-200" data-testid="state-upload-error">Upload failed. Check the source and try again.</p>}
            <div className="flex justify-end gap-2 border-t border-border/70 pt-4"><Btn type="button" onClick={() => setUploadOpen(false)} data-testid="button-cancel-upload">Cancel</Btn><Btn variant="gold" type="submit" disabled={!uploadFile || uploadDocument.isPending} data-testid="button-submit-upload">{uploadDocument.isPending ? 'Uploading and indexing…' : 'Upload source'}</Btn></div>
          </form></Form>
        </section>
      </div>}

      {collectionOpen && <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/75 p-0 backdrop-blur-sm sm:items-center sm:p-5" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCollectionOpen(false); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="collection-title" className="knowledge-panel w-full max-w-md rounded-t-2xl border border-slate-600/70 p-5 shadow-2xl sm:rounded-2xl sm:p-6" data-testid="dialog-collection">
          <div className="flex items-start justify-between"><div><p className="text-[9px] font-bold uppercase tracking-[.2em] text-primary">Organize the library</p><h2 id="collection-title" className="mt-1 text-xl font-bold text-slate-100">{editingCollection ? 'Edit collection' : 'New collection'}</h2></div><button type="button" aria-label="Close collection dialog" onClick={() => setCollectionOpen(false)} data-testid="button-close-collection" className="rounded-md p-1.5 text-slate-400 hover:bg-secondary hover:text-white"><X className="h-4 w-4" /></button></div>
          <Form {...collectionForm}><form onSubmit={collectionForm.handleSubmit(handleCreateCollection)} className="mt-5 space-y-4">
            <FormField control={collectionForm.control} name="name" rules={{ required: 'Name your collection.', maxLength: { value: 48, message: 'Use no more than 48 characters.' }, validate: (value) => !!value.trim() || 'Name your collection.' }} render={({ field }) => <FormItem><FormLabel className="text-[10px] font-bold uppercase tracking-[.16em] text-muted-foreground">Name</FormLabel><FormControl><Input {...field} maxLength={48} placeholder="e.g. EIPs and standards" data-testid="input-collection-name" /></FormControl><FormMessage /></FormItem>} />
            <FormField control={collectionForm.control} name="description" rules={{ maxLength: { value: 160, message: 'Use no more than 160 characters.' } }} render={({ field }) => <FormItem><FormLabel className="text-[10px] font-bold uppercase tracking-[.16em] text-muted-foreground">Description <span className="font-normal normal-case tracking-normal">(optional)</span></FormLabel><FormControl><Textarea {...field} maxLength={160} rows={3} placeholder="A short note about the collection" data-testid="input-collection-description" /></FormControl><FormMessage /></FormItem>} />
            {(createCollection.isError || updateCollection.isError) && <p role="alert" className="text-xs text-rose-200" data-testid="state-collection-error">Could not save the collection. Try again.</p>}
            <div className="flex justify-end gap-2 border-t border-border/70 pt-4">{editingCollection && <Btn type="button" variant="danger" onClick={() => { if (window.confirm(translateTemplate('Delete collection {name}?', locale, { name: editingCollection.name }))) deleteCollection.mutate({ id: editingCollection.id }, { onSuccess: () => { if (selectedCollection === editingCollection.id) setSelectedCollection(undefined); invalidateLibrary(); setCollectionOpen(false); collectionForm.reset(); } }); }} disabled={deleteCollection.isPending} data-testid="button-delete-collection"><Trash2 className="h-3.5 w-3.5" />Delete</Btn>}<Btn type="button" onClick={() => setCollectionOpen(false)} data-testid="button-cancel-collection">Cancel</Btn><Btn variant="gold" type="submit" disabled={!(collectionForm.watch('name') ?? '').trim() || createCollection.isPending || updateCollection.isPending} data-testid="button-save-collection">{createCollection.isPending || updateCollection.isPending ? 'Saving…' : 'Save collection'}</Btn></div>
          </form></Form>
        </section>
      </div>}

      {selectedDocumentId && <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/75 p-0 backdrop-blur-sm sm:items-center sm:p-5" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedDocumentId(null); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="source-detail-title" className="knowledge-panel max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-slate-600/70 p-5 shadow-2xl sm:rounded-2xl sm:p-6" data-testid="dialog-source-detail">
          <div className="flex items-start justify-between gap-4"><div className="min-w-0"><p className="text-[9px] font-bold uppercase tracking-[.2em] text-primary">Source details</p><h2 id="source-detail-title" className="mt-1 break-words text-xl font-bold text-slate-100">{detailDocument?.title ?? 'Loading source…'}</h2></div><button type="button" aria-label="Close source details" onClick={() => setSelectedDocumentId(null)} data-testid="button-close-source-detail" className="rounded-md p-1.5 text-slate-400 hover:bg-secondary hover:text-white"><X className="h-4 w-4" /></button></div>
          {detailQuery.isLoading ? <div className="mt-5 space-y-3" aria-label="Loading source details" data-testid="state-source-detail-loading"><div className="knowledge-skeleton h-16 rounded-lg" /><div className="knowledge-skeleton h-24 rounded-lg" /></div> : detailQuery.isError || !detailDocument ? <div role="alert" className="mt-5 rounded-lg border border-rose-300/20 bg-rose-950/20 p-4 text-xs text-rose-200" data-testid="state-source-detail-error">Could not load this source. Close and try again.</div> : <div className="mt-5 space-y-5">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{[['Format', detailDocument.format.toUpperCase()], ['Size', bytesLabel(detailDocument.sizeBytes)], ['Pages', detailDocument.pageCount === null ? 'Not provided' : String(detailDocument.pageCount)], ['Chunks', String(detailDocument.chunkCount)]].map(([label, value]) => <div key={label} className="rounded-lg border border-border/70 bg-slate-950/30 px-3 py-2"><p className="text-[9px] font-bold uppercase tracking-[.15em] text-slate-500">{label}</p><p className="mt-1 text-xs font-medium text-slate-200">{value}</p></div>)}</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1.5"><span className="text-[9px] font-bold uppercase tracking-[.16em] text-muted-foreground">Category</span><Select value={detailCategory} onChange={(event) => setDetailCategory(event.target.value as KnowledgeCategory)} data-testid="select-source-category">{categories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</Select></label>
              <div className="space-y-1.5"><p className="text-[9px] font-bold uppercase tracking-[.16em] text-muted-foreground">Collections</p><div className="max-h-24 space-y-1 overflow-auto rounded-md border border-input bg-background/40 p-2">{collections.length ? collections.map((collection) => <label key={collection.id} className="flex items-center gap-2 py-1 text-[11px] text-slate-300"><input type="checkbox" checked={detailCollections.includes(collection.id)} onChange={(event) => setDetailCollections((prior) => event.target.checked ? [...prior, collection.id] : prior.filter((id) => id !== collection.id))} data-testid={`checkbox-source-collection-${collection.id}`} className="accent-cyan-300" />{collection.name}</label>) : <p className="text-[10px] text-slate-500">Create a collection to organize this source.</p>}</div></div>
            </div>
            {detailDocument.redacted && <p className="flex items-center gap-2 text-[10px] text-emerald-200/80" data-testid="status-source-redacted"><ShieldCheck className="h-3.5 w-3.5" />Secret redaction was applied to the extracted text.</p>}
            {(detailDocument.warning || detailDocument.errorMessage) && <div role={detailDocument.errorMessage ? 'alert' : undefined} className={`rounded-lg border p-3 text-[11px] leading-5 ${detailDocument.errorMessage ? 'border-rose-300/20 bg-rose-950/20 text-rose-200' : 'border-amber-300/20 bg-amber-950/15 text-amber-100/80'}`} data-testid="notice-source-warning"><AlertTriangle className="mr-1.5 inline h-3.5 w-3.5" />{detailDocument.errorMessage || detailDocument.warning}</div>}
            {updateDocument.isError && <p role="alert" className="text-xs text-rose-200" data-testid="state-source-update-error">Source details could not be saved.</p>}
            {deleteDocument.isError && <p role="alert" className="text-xs text-rose-200" data-testid="state-source-delete-error">Source could not be deleted. Try again.</p>}
            {reindexDocument.isError && <p role="alert" className="text-xs text-rose-200" data-testid="state-source-reindex-error">Re-indexing failed. Try again later.</p>}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-4">
              <div className="flex flex-wrap gap-2">
                {detailDocument.status === 'error' && <Btn size="sm" onClick={() => { setSelectedDocumentId(null); uploadForm.reset({ category: detailDocument.category }); setUploadOpen(true); }} data-testid="button-reupload-source"><Upload className="h-3.5 w-3.5" />Upload source again</Btn>}
                <Btn size="sm" onClick={() => reindexDocument.mutate({ id: detailDocument.id }, { onSuccess: invalidateLibrary })} disabled={detailDocument.chunkCount < 1 || reindexDocument.isPending} data-testid="button-reindex-source" title={detailDocument.chunkCount < 1 ? 'No stored text chunks to re-index. Upload the source again.' : 'Rebuild embeddings from stored text chunks'}><RefreshCw className={`h-3.5 w-3.5 ${reindexDocument.isPending ? 'animate-spin' : ''}`} />{reindexDocument.isPending ? 'Re-indexing…' : 'Re-index chunks'}</Btn>
                <Btn size="sm" variant="danger" onClick={() => { if (window.confirm(translateTemplate('Delete document {title} and its indexed text?', locale, { title: detailDocument.title }))) deleteDocument.mutate({ id: detailDocument.id }, { onSuccess: () => { setSelectedDocumentId(null); invalidateLibrary(); } }); }} disabled={deleteDocument.isPending} data-testid="button-delete-source"><Trash2 className="h-3.5 w-3.5" />Delete</Btn>
              </div>
              <div className="flex gap-2"><Btn size="sm" onClick={() => setSelectedDocumentId(null)} data-testid="button-cancel-source-detail">Close</Btn><Btn variant="gold" size="sm" onClick={saveDocumentMetadata} disabled={updateDocument.isPending} data-testid="button-save-source-metadata">{updateDocument.isPending ? 'Saving…' : <><Check className="h-3.5 w-3.5" />Save details</>}</Btn></div>
            </div>
          </div>}
        </section>
      </div>}
    </div>
    </LocalizedTree>
  );
}
