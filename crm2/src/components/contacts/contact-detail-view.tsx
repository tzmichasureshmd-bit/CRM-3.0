'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { addContactTag, deleteContactTag } from '@/lib/contacts/tag-api';
import { useAuth } from '@/hooks/use-auth';
import { formatCurrency } from '@/lib/currency';
import { toast } from 'sonner';
import type { Contact, Tag, ContactTag, ContactNote, CustomField, ContactCustomValue, Deal, MessageTemplate, Message, FollowUp, LeadStatus } from '@/types';
import { TemplatePicker, type TemplateSendValues } from '@/components/inbox/template-picker';
import { ContactTimeline } from './contact-timeline';
import { Contact360Panel } from './contact-360-panel';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { LeadStatusSelect } from '@/components/inbox/lead-status-select';
import { parseLeadStatus } from '@/lib/crm/lead-status';
import {
  Phone,
  Mail,
  Building2,
  Copy,
  Check,
  Loader2,
  Plus,
  Trash2,
  Save,
  X,
  DollarSign,
  LayoutTemplate,
  FileText,
  Calendar,
  CheckCircle2,
  Circle,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

interface ContactDetailViewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactId: string | null;
  onUpdated: () => void;
}

export function ContactDetailView({
  open,
  onOpenChange,
  contactId,
  onUpdated,
}: ContactDetailViewProps) {
  const t = useTranslations('Contacts.detailView');
  const supabase = createClient();
  const { accountId, defaultCurrency } = useAuth();

  const [contact, setContact] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(false);
  const [copiedPhone, setCopiedPhone] = useState(false);

  // Send template — lets the business initiate (or re-open) a conversation
  // with this contact by sending an approved template. The send route
  // find-or-creates the conversation, so no inbound message is required.
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [sendingTemplate, setSendingTemplate] = useState(false);

  // Details tab
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editCompany, setEditCompany] = useState('');
  const [editCountry, setEditCountry] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editWebsite, setEditWebsite] = useState('');
  const [editRating, setEditRating] = useState('');
  const [editReviewCount, setEditReviewCount] = useState('');
  const [savingDetails, setSavingDetails] = useState(false);

  // Tags tab
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [contactTagIds, setContactTagIds] = useState<string[]>([]);
  const [savingTags, setSavingTags] = useState(false);

  // Notes tab
  const [notes, setNotes] = useState<ContactNote[]>([]);
  const [newNote, setNewNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [loadingNotes, setLoadingNotes] = useState(false);

  // Custom fields tab
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [savingCustom, setSavingCustom] = useState(false);
  const [loadingCustom, setLoadingCustom] = useState(false);

  // Deals tab
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loadingDeals, setLoadingDeals] = useState(false);
  const [newDealTitle, setNewDealTitle] = useState('');
  const [newDealValue, setNewDealValue] = useState('');
  const [showDealForm, setShowDealForm] = useState(false);
  const [savingDeal, setSavingDeal] = useState(false);

  // Documents tab — media shared with this contact across all conversations
  const [documents, setDocuments] = useState<Message[]>([]);
  const [loadingDocuments, setLoadingDocuments] = useState(false);

  // Lead status — written by the shared CRM STATUS control (spec §23–§27)
  const [leadStatus, setLeadStatus] = useState<LeadStatus | null>(null);

  // Follow-ups tab
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [loadingFollowUps, setLoadingFollowUps] = useState(false);
  const [newFollowUpTitle, setNewFollowUpTitle] = useState('');
  const [newFollowUpDate, setNewFollowUpDate] = useState('');
  const [addingFollowUp, setAddingFollowUp] = useState(false);

  const fetchContact = useCallback(async () => {
    if (!contactId) return;
    setLoading(true);

    const { data } = await supabase
      .from('contacts')
      .select('*')
      .eq('id', contactId)
      .single();

    if (data) {
      setContact(data);
      setEditName(data.name ?? '');
      setEditPhone(data.phone);
      setEditEmail(data.email ?? '');
      setEditCompany(data.company ?? '');
      setEditCountry(data.country ?? '');
      setEditLocation(data.location ?? '');
      setEditCategory(data.category ?? '');
      setEditAddress(data.address ?? '');
      setEditWebsite(data.website ?? '');
      setEditRating(data.rating != null ? String(data.rating) : '');
      setEditReviewCount(data.review_count != null ? String(data.review_count) : '');
      setLeadStatus(parseLeadStatus(data.lead_status));
    }
    setLoading(false);
  }, [contactId, supabase]);

  const fetchTags = useCallback(async () => {
    if (!contactId) return;

    const [tagsRes, contactTagsRes] = await Promise.all([
      supabase.from('tags').select('*').order('name'),
      supabase.from('contact_tags').select('tag_id').eq('contact_id', contactId),
    ]);

    if (tagsRes.data) setAllTags(tagsRes.data);
    if (contactTagsRes.data) {
      setContactTagIds(contactTagsRes.data.map((ct) => ct.tag_id));
    }
  }, [contactId, supabase]);

  const fetchNotes = useCallback(async () => {
    if (!contactId) return;
    setLoadingNotes(true);

    const { data } = await supabase
      .from('contact_notes')
      .select('*')
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false });

    if (data) setNotes(data);
    setLoadingNotes(false);
  }, [contactId, supabase]);

  const fetchCustomFields = useCallback(async () => {
    if (!contactId) return;
    setLoadingCustom(true);

    const [fieldsRes, valuesRes] = await Promise.all([
      supabase.from('custom_fields').select('*').order('field_name'),
      supabase
        .from('contact_custom_values')
        .select('*')
        .eq('contact_id', contactId),
    ]);

    if (fieldsRes.data) setCustomFields(fieldsRes.data);
    if (valuesRes.data) {
      const map: Record<string, string> = {};
      valuesRes.data.forEach((v) => {
        map[v.custom_field_id] = v.value ?? '';
      });
      setCustomValues(map);
    }
    setLoadingCustom(false);
  }, [contactId, supabase]);

  const fetchDeals = useCallback(async () => {
    if (!contactId) return;
    setLoadingDeals(true);
    const { data } = await supabase
      .from('deals')
      .select('*, stage:pipeline_stages(*)')
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false });
    setDeals((data ?? []) as Deal[]);
    setLoadingDeals(false);
  }, [contactId, supabase]);

  async function createDeal() {
    if (!contactId || !newDealTitle.trim()) return;
    setSavingDeal(true);

    try {
      const { data: pipelines, error: pipeErr } = await supabase
        .from('pipelines')
        .select('id')
        .limit(1)
        .single();

      if (pipeErr || !pipelines) {
        toast.error(t('dealsTab.noPipelines'));
        setSavingDeal(false);
        return;
      }

      const { data: stages, error: stageErr } = await supabase
        .from('pipeline_stages')
        .select('id')
        .eq('pipeline_id', pipelines.id)
        .order('position')
        .limit(1)
        .single();

      if (stageErr || !stages) {
        toast.error(t('dealsTab.noPipelines'));
        setSavingDeal(false);
        return;
      }

      const { error } = await supabase.from('deals').insert({
        title: newDealTitle.trim(),
        value: newDealValue ? Number(newDealValue) : 0,
        currency: defaultCurrency,
        contact_id: contactId,
        pipeline_id: pipelines.id,
        stage_id: stages.id,
        user_id: (await supabase.auth.getUser()).data.user?.id,
        account_id: accountId,
        status: 'open',
      });

      if (error) {
        toast.error(t('dealsTab.toastDealFailed'));
      } else {
        toast.success(t('dealsTab.toastDealCreated'));
        setNewDealTitle('');
        setNewDealValue('');
        setShowDealForm(false);
        fetchDeals();
        onUpdated();
      }
    } catch {
      toast.error(t('dealsTab.toastDealFailed'));
    }

    setSavingDeal(false);
  }

  // Documents tab — fetch all media messages for this contact's conversations
  const fetchDocuments = useCallback(async () => {
    if (!contactId) return;
    setLoadingDocuments(true);

    try {
      // 1. Get all conversation IDs for this contact
      const { data: convs, error: convErr } = await supabase
        .from('conversations')
        .select('id')
        .eq('contact_id', contactId);

      if (convErr || !convs || convs.length === 0) {
        setDocuments([]);
        setLoadingDocuments(false);
        return;
      }

      // 2. Get all media messages across those conversations
      const convIds = convs.map((c) => c.id);
      const { data: msgs, error: msgErr } = await supabase
        .from('messages')
        .select('*')
        .in('conversation_id', convIds)
        .not('media_url', 'is', null)
        .order('created_at', { ascending: false });

      if (msgErr) {
        console.error('Failed to fetch documents:', msgErr);
        setDocuments([]);
      } else {
        setDocuments((msgs ?? []) as Message[]);
      }
    } catch (err) {
      console.error('Fetch documents error:', err);
      setDocuments([]);
    } finally {
      setLoadingDocuments(false);
    }
  }, [contactId, supabase]);

  const fetchFollowUps = useCallback(async () => {
    if (!contactId) return;
    setLoadingFollowUps(true);
    try {
      const res = await fetch(`/api/follow-ups?contact_id=${contactId}`);
      if (res.ok) {
        const data = await res.json();
        setFollowUps(data as FollowUp[]);
      }
    } catch {
      setFollowUps([]);
    } finally {
      setLoadingFollowUps(false);
    }
  }, [contactId]);

  async function addFollowUp() {
    if (!contactId || !newFollowUpTitle.trim()) return;
    setAddingFollowUp(true);
    const res = await fetch('/api/follow-ups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contact_id: contactId, title: newFollowUpTitle.trim(), due_date: newFollowUpDate || null }),
    });
    if (res.ok) {
      const data = await res.json();
      setFollowUps((prev) => [data, ...prev]);
      setNewFollowUpTitle('');
      setNewFollowUpDate('');
    } else {
      toast.error(t('toastUpdateFailed'));
    }
    setAddingFollowUp(false);
  }

  async function toggleFollowUp(fu: FollowUp) {
    const nextStatus = fu.status === 'pending' ? 'completed' : 'pending';
    const res = await fetch(`/api/follow-ups/${fu.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: nextStatus }),
    });
    if (res.ok) {
      const data = await res.json();
      setFollowUps((prev) => prev.map((f) => f.id === fu.id ? data : f));
    }
  }

  async function deleteFollowUp(fuId: string) {
    const res = await fetch(`/api/follow-ups/${fuId}`, { method: 'DELETE' });
    if (res.ok) {
      setFollowUps((prev) => prev.filter((f) => f.id !== fuId));
    } else {
      toast.error(t('toastUpdateFailed'));
    }
  }

  useEffect(() => {
    if (open && contactId) {
      fetchContact();
      fetchTags();
       fetchNotes();
       fetchCustomFields();
       fetchDeals();
       fetchDocuments();
       fetchFollowUps();
     }
   }, [open, contactId, fetchContact, fetchTags, fetchNotes, fetchCustomFields, fetchDeals, fetchDocuments, fetchFollowUps]);

  async function copyPhone() {
    if (!contact) return;
    await navigator.clipboard.writeText(contact.phone);
    setCopiedPhone(true);
    setTimeout(() => setCopiedPhone(false), 2000);
  }

  async function saveDetails() {
    if (!contactId || !editPhone.trim()) {
      toast.error(t('toastPhoneRequired'));
      return;
    }

    setSavingDetails(true);
    const { error } = await supabase
      .from('contacts')
      .update({
        name: editName.trim() || null,
        phone: editPhone.trim(),
        email: editEmail.trim() || null,
        company: editCompany.trim() || null,
        country: editCountry.trim() || null,
        location: editLocation.trim() || null,
        category: editCategory.trim() || null,
        address: editAddress.trim() || null,
        website: editWebsite.trim() || null,
        rating: editRating.trim() ? parseFloat(editRating) : null,
        review_count: editReviewCount.trim() ? parseInt(editReviewCount, 10) : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', contactId);

    if (error) {
      toast.error(t('toastUpdateFailed'));
    } else {
      toast.success(t('toastUpdated'));
      fetchContact();
      onUpdated();
    }
    setSavingDetails(false);
  }

  async function toggleTag(tagId: string) {
    if (!contactId) return;
    setSavingTags(true);

    const isSelected = contactTagIds.includes(tagId);

    try {
      if (isSelected) {
        await deleteContactTag(contactId, tagId);
        setContactTagIds((prev) => prev.filter((id) => id !== tagId));
      } else {
        await addContactTag(contactId, tagId);
        setContactTagIds((prev) => [...prev, tagId]);
      }
      onUpdated();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('toastUpdateFailed'));
    }
    setSavingTags(false);
  }

  async function addNote() {
    if (!contactId || !newNote.trim()) return;
    setSavingNote(true);

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user || !accountId) {
      toast.error(t('toastNotAuthenticated'));
      setSavingNote(false);
      return;
    }

    const { error } = await supabase.from('contact_notes').insert({
      contact_id: contactId,
      account_id: accountId,
      user_id: user.id,
      note_text: newNote.trim(),
    });

    if (error) {
      toast.error(t('toastNoteAddFailed'));
    } else {
      setNewNote('');
      fetchNotes();
      toast.success(t('toastNoteAdded'));
    }
    setSavingNote(false);
  }

  async function deleteNote(noteId: string) {
    const { error } = await supabase
      .from('contact_notes')
      .delete()
      .eq('id', noteId);

    if (error) {
      toast.error(t('toastNoteDeleteFailed'));
    } else {
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
      toast.success(t('toastNoteDeleted'));
    }
  }

  async function saveCustomFields() {
    if (!contactId) return;
    setSavingCustom(true);

    try {
      // Delete existing values and re-insert
      await supabase
        .from('contact_custom_values')
        .delete()
        .eq('contact_id', contactId);

      const rows = Object.entries(customValues)
        .filter(([, val]) => val.trim())
        .map(([fieldId, val]) => ({
          contact_id: contactId,
          custom_field_id: fieldId,
          value: val.trim(),
        }));

      if (rows.length > 0) {
        const { error } = await supabase
          .from('contact_custom_values')
          .insert(rows);
        if (error) throw error;
      }

      toast.success(t('toastCustomFieldsSaved'));
    } catch {
      toast.error(t('toastCustomFieldsFailed'));
    }
    setSavingCustom(false);
  }

  async function handleSendTemplate(
    template: MessageTemplate,
    values: TemplateSendValues,
  ) {
    if (!contactId) return;
    setSendingTemplate(true);
    try {
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // No conversation_id — the route find-or-creates one for this
          // contact, mirroring the inbox template-send payload otherwise.
          contact_id: contactId,
          message_type: 'template',
          template_name: template.name,
          template_language: template.language,
          template_message_params: {
            body: values.body,
            headerText: values.headerText,
            buttonParams: values.buttonParams,
          },
          template_params: values.body,
        }),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        const reason = payload?.error || `HTTP ${res.status}`;
        toast.error(t('toastTemplateFailed', { reason }));
        return;
      }

      toast.success(t('toastTemplateSent', { name: template.name }));
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'network error';
      toast.error(`Failed to send template: ${reason}`);
    } finally {
      setSendingTemplate(false);
    }
  }

  function getInitials(name?: string | null) {
    if (!name) return '?';
    return name
      .split(' ')
      .map((w) => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }

  return (
    <>
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="bg-popover border-border text-popover-foreground sm:max-w-lg w-full p-0"
      >
        {loading || !contact ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="size-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="flex flex-col h-full">
            {/* Header */}
            <SheetHeader className="p-4 border-b border-border/50">
              <div className="flex items-center gap-3">
                <Avatar className="size-12 bg-muted border border-border">
                  <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
                    {getInitials(contact.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <SheetTitle className="text-popover-foreground truncate">
                    {contact.name || t('unnamed')}
                  </SheetTitle>
                  <SheetDescription className="text-muted-foreground text-xs mt-0.5">
                    {t('contactDetailsDesc')}
                  </SheetDescription>
                  <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                    <button
                      onClick={copyPhone}
                      className="flex items-center gap-1 hover:text-primary transition-colors cursor-pointer"
                    >
                      <Phone className="size-3" />
                      {contact.phone}
                      {copiedPhone ? (
                        <Check className="size-3 text-primary" />
                      ) : (
                        <Copy className="size-3" />
                      )}
                    </button>
                    {contact.email && (
                      <span className="flex items-center gap-1">
                        <Mail className="size-3" />
                        {contact.email}
                      </span>
                    )}
                    {contact.company && (
                      <span className="flex items-center gap-1">
                        <Building2 className="size-3" />
                        {contact.company}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="mt-3">
                <Button
                  size="sm"
                  onClick={() => setTemplatePickerOpen(true)}
                  disabled={sendingTemplate}
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  {sendingTemplate ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <LayoutTemplate className="size-4" />
                  )}
                  {t('sendTemplateBtn')}
                </Button>
              </div>
            </SheetHeader>

            {/* Tabs */}
            <Tabs defaultValue="details" className="flex-1 flex flex-col min-h-0">
              <TabsList className="bg-muted/50 border-b border-border mx-4 mt-3">
               <TabsTrigger
                  value="details"
                  className="data-active:bg-muted data-active:text-primary text-muted-foreground"
                >
                  {t('tabs.details')}
                </TabsTrigger>
                <TabsTrigger
                  value="overview"
                  className="data-active:bg-muted data-active:text-primary text-muted-foreground"
                >
                  {t('tabs.overview', { fallback: '360' })}
                </TabsTrigger>
                <TabsTrigger
                  value="activity"
                  className="data-active:bg-muted data-active:text-primary text-muted-foreground"
                >
                 {t('tabs.activity', { fallback: 'Activity' })}
                 </TabsTrigger>
                 <TabsTrigger
                    value="documents"
                    className="data-active:bg-muted data-active:text-primary text-muted-foreground"
                  >
                    {t('tabs.documents', { fallback: 'Documents' })}
                  </TabsTrigger>
                 <TabsTrigger
                  value="tags"
                  className="data-active:bg-muted data-active:text-primary text-muted-foreground"
                >
                  {t('tabs.tags', { fallback: 'Tags' })}
                </TabsTrigger>
                <TabsTrigger
                  value="notes"
                  className="data-active:bg-muted data-active:text-primary text-muted-foreground"
                >
                  {t('tabs.notes')}
                </TabsTrigger>
                <TabsTrigger
                  value="custom"
                  className="data-active:bg-muted data-active:text-primary text-muted-foreground"
                >
                  {t('tabs.custom')}
                </TabsTrigger>
                <TabsTrigger
                  value="deals"
                  className="data-active:bg-muted data-active:text-primary text-muted-foreground"
                >
                  {t('tabs.deals')}
                </TabsTrigger>
                <TabsTrigger
                  value="followups"
                  className="data-active:bg-muted data-active:text-primary text-muted-foreground"
                >
                  {t('tabs.followups', { fallback: 'Follow-ups' })}
                </TabsTrigger>
              </TabsList>

              {/* Details Tab */}
              <TabsContent value="details" className="flex-1 overflow-y-auto px-4 py-3">
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-muted-foreground text-xs">{t('company', { fallback: 'Name' })}</Label>
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="bg-muted border-border text-foreground h-8 text-sm"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-muted-foreground text-xs">
                      {t('phone')} <span className="text-red-400">*</span>
                    </Label>
                    <Input
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      className="bg-muted border-border text-foreground h-8 text-sm"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-muted-foreground text-xs">{t('email')}</Label>
                    <Input
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      className="bg-muted border-border text-foreground h-8 text-sm"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-muted-foreground text-xs">{t('company')}</Label>
                    <Input
                      value={editCompany}
                      onChange={(e) => setEditCompany(e.target.value)}
                      className="bg-muted border-border text-foreground h-8 text-sm"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <Label className="text-muted-foreground text-xs">Country</Label>
                      <Input
                        value={editCountry}
                        onChange={(e) => setEditCountry(e.target.value)}
                        className="bg-muted border-border text-foreground h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-muted-foreground text-xs">Location</Label>
                      <Input
                        value={editLocation}
                        onChange={(e) => setEditLocation(e.target.value)}
                        className="bg-muted border-border text-foreground h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-muted-foreground text-xs">Category</Label>
                      <Input
                        value={editCategory}
                        onChange={(e) => setEditCategory(e.target.value)}
                        className="bg-muted border-border text-foreground h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-muted-foreground text-xs">Website</Label>
                      <Input
                        value={editWebsite}
                        onChange={(e) => setEditWebsite(e.target.value)}
                        className="bg-muted border-border text-foreground h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-muted-foreground text-xs">Rating</Label>
                      <Input
                        inputMode="decimal"
                        value={editRating}
                        onChange={(e) => setEditRating(e.target.value)}
                        className="bg-muted border-border text-foreground h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-muted-foreground text-xs">Reviews</Label>
                      <Input
                        inputMode="numeric"
                        value={editReviewCount}
                        onChange={(e) => setEditReviewCount(e.target.value)}
                        className="bg-muted border-border text-foreground h-8 text-sm"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-muted-foreground text-xs">Address</Label>
                    <Input
                      value={editAddress}
                      onChange={(e) => setEditAddress(e.target.value)}
                      className="bg-muted border-border text-foreground h-8 text-sm"
                    />
                  </div>

                  {/* Lead Ads source attribution (migration 061) */}
                  {contact.source_platform && (
                    <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-1.5">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Lead Source
                      </p>
                      {contact.source_platform && (
                        <SourceDetail
                          label="Platform"
                          value={contact.source_platform === 'instagram' ? 'Instagram' : 'Facebook'}
                        />
                      )}
                      {contact.source_page_name && (
                        <SourceDetail label="Page" value={contact.source_page_name} />
                      )}
                      {contact.source_instagram_username && (
                        <SourceDetail label="Instagram" value={`@${contact.source_instagram_username}`} />
                      )}
                      {contact.campaign_name && (
                        <SourceDetail label="Campaign" value={contact.campaign_name} />
                      )}
                      {contact.adset_name && (
                        <SourceDetail label="Ad Set" value={contact.adset_name} />
                      )}
                      {contact.ad_name && (
                        <SourceDetail label="Ad" value={contact.ad_name} />
                      )}
                      {contact.form_name && (
                        <SourceDetail label="Form" value={contact.form_name} />
                      )}
                      {contact.meta_lead_id && (
                        <SourceDetail label="Meta Lead ID" value={contact.meta_lead_id} mono />
                      )}
                      {contact.meta_created_time && (
                        <SourceDetail
                          label="Lead Created"
                          value={new Date(contact.meta_created_time).toLocaleString()}
                        />
                      )}
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <Label className="text-muted-foreground text-xs">{t('leadStatus', { fallback: 'Lead Status' })}</Label>
                    <LeadStatusSelect
                      key={contactId ?? ''}
                      contactId={contactId ?? ''}
                      value={leadStatus}
                      placeholder="Select lead status"
                      className="w-full"
                      triggerClassName="bg-muted border-border text-foreground h-8 text-sm w-full"
                      onChange={(status) => {
                        setLeadStatus(status);
                        setContact((prev) => (prev ? { ...prev, lead_status: status } : prev));
                        onUpdated();
                      }}
                    />
                  </div>

                  <Button
                    onClick={saveDetails}
                    disabled={savingDetails}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground w-full"
                    size="sm"
                  >
                    {savingDetails ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Save className="size-3.5" />
                    )}
                    {t('saveChangesBtn')}
                  </Button>
                </div>
              </TabsContent>

              {/* Customer 360 / Overview Tab */}
              <TabsContent value="overview" className="flex-1 overflow-y-auto px-4 py-3">
                {contact ? (
                  <Contact360Panel key={contact.id} contact={contact} />
                ) : (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="size-5 animate-spin text-muted-foreground" />
                  </div>
                )}
              </TabsContent>

              {/* Activity / Timeline Tab */}
              <TabsContent value="activity" className="flex-1 overflow-y-auto">
                {contact ? (
                  <ContactTimeline
                    contactId={contact.id}
                    contactCreatedAt={contact.created_at}
                    contactName={contact.name}
                  />
                ) : null}
              </TabsContent>

              {/* Documents Tab — media shared with this contact */}
              <TabsContent value="documents" className="flex-1 overflow-y-auto px-4 py-3">
                {loadingDocuments ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="size-5 animate-spin text-muted-foreground" />
                  </div>
                ) : documents.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                    <FileText className="size-8 text-muted-foreground" />
                    <p className="text-sm font-medium text-foreground">No documents shared yet</p>
                    <p className="text-xs text-muted-foreground">
                      Media, images, and files shared with this contact will appear here.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                    {documents.map((msg) => {
                      const isImage = msg.content_type === 'image';
                      const isVideo = msg.content_type === 'video';
                      const isAudio = msg.content_type === 'audio';

                      return (
                        <div key={msg.id} className="space-y-1">
                          <a
                            href={msg.media_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block"
                          >
                            {isImage ? (
                              <img
                                src={msg.media_url}
                                alt={msg.content_text || 'Shared image'}
                                className="aspect-square rounded-lg object-cover w-full h-20"
                              />
                            ) : isVideo ? (
                              <div className="flex h-20 w-full items-center justify-center rounded-lg bg-muted">
                                <video
                                  src={msg.media_url}
                                  controls
                                  className="h-16 w-full rounded-lg object-cover"
                                />
                              </div>
                            ) : isAudio ? (
                              <div className="flex h-20 w-full items-center justify-center rounded-lg bg-muted">
                                <audio src={msg.media_url} controls className="w-full" />
                              </div>
                            ) : (
                              <div className="flex h-20 w-full items-center justify-center rounded-lg bg-muted/50">
                                <FileText className="size-6 text-muted-foreground" />
                              </div>
                            )}
                          </a>
                          {msg.content_text && (
                            <p className="truncate text-[10px] text-muted-foreground">
                              {msg.content_text}
                            </p>
                          )}
                          <p className="text-[10px] text-muted-foreground opacity-60">
                            {new Date(msg.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </TabsContent>

              {/* Tags Tab */}
              <TabsContent value="tags" className="flex-1 overflow-y-auto px-4 py-3">
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    {t('tagsTab.clickTagDesc')}
                  </p>
                  {allTags.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {t('tagsTab.noTagsAvailable')}
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {allTags.map((tag) => {
                        const selected = contactTagIds.includes(tag.id);
                        return (
                          <button
                            key={tag.id}
                            onClick={() => toggleTag(tag.id)}
                            disabled={savingTags}
                            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-all cursor-pointer ${
                              selected
                                ? 'ring-2 ring-primary ring-offset-1 ring-offset-border'
                                : 'opacity-50 hover:opacity-80'
                            }`}
                            style={{
                              backgroundColor: tag.color + '20',
                              color: tag.color,
                            }}
                          >
                            {selected && <Check className="size-3 mr-1" />}
                            {tag.name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* Notes Tab */}
              <TabsContent value="notes" className="flex-1 flex flex-col min-h-0 px-4 py-3">
                <div className="space-y-2 mb-3">
                  <Textarea
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    placeholder={t('notesTab.placeholder')}
                    className="bg-muted border-border text-foreground placeholder:text-muted-foreground min-h-[60px] text-sm resize-none"
                  />
                  <Button
                    onClick={addNote}
                    disabled={!newNote.trim() || savingNote}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground"
                    size="sm"
                  >
                    {savingNote ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Plus className="size-3.5" />
                    )}
                    {t('notesTab.save')}
                  </Button>
                </div>

                <div className="flex-1 overflow-y-auto space-y-2">
                  {loadingNotes ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="size-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : notes.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      {t('notesTab.noNotes')}
                    </p>
                  ) : (
                    notes.map((note) => (
                      <div
                        key={note.id}
                        className="rounded-lg bg-muted/50 border border-border/50 p-3 group"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm text-muted-foreground whitespace-pre-wrap flex-1">
                            {note.note_text}
                          </p>
                          <button
                            onClick={() => deleteNote(note.id)}
                            className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400 transition-all cursor-pointer shrink-0"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1.5">
                          {new Date(note.created_at).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </TabsContent>

              {/* Custom Fields Tab */}
              <TabsContent value="custom" className="flex-1 overflow-y-auto px-4 py-3">
                {loadingCustom ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="size-5 animate-spin text-muted-foreground" />
                  </div>
                ) : customFields.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    {t('noCustomFields')}
                  </p>
                ) : (
                  <div className="space-y-3">
                    {customFields.map((field) => (
                      <div key={field.id} className="space-y-1.5">
                        <Label className="text-muted-foreground text-xs capitalize">
                          {field.field_name}
                        </Label>
                        <Input
                          value={customValues[field.id] ?? ''}
                          onChange={(e) =>
                            setCustomValues((prev) => ({
                              ...prev,
                              [field.id]: e.target.value,
                            }))
                          }
                          placeholder={t('enterCustomField', { name: field.field_name })}
                          className="bg-muted border-border text-foreground h-8 text-sm placeholder:text-muted-foreground"
                        />
                      </div>
                    ))}
                    <Button
                      onClick={saveCustomFields}
                      disabled={savingCustom}
                      className="bg-primary hover:bg-primary/90 text-primary-foreground w-full"
                      size="sm"
                    >
                      {savingCustom ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Save className="size-3.5" />
                      )}
                      {t('saveCustomFieldsBtn')}
                    </Button>
                  </div>
                )}
              </TabsContent>

              {/* Deals Tab */}
              <TabsContent value="deals" className="flex-1 overflow-y-auto px-4 py-3">
                {loadingDeals ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="size-5 animate-spin text-primary" />
                  </div>
                ) : (
                  <div className="space-y-2">
                    {!showDealForm && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowDealForm(true)}
                        className="w-full border-dashed border-border text-muted-foreground hover:text-foreground h-8 text-xs"
                      >
                        <Plus className="size-3.5 mr-1" />
                        {t('dealsTab.createDeal')}
                      </Button>
                    )}
                    {showDealForm && (
                      <div className="rounded-lg border border-border bg-muted/50 p-3 space-y-2">
                        <Input
                          value={newDealTitle}
                          onChange={(e) => setNewDealTitle(e.target.value)}
                          placeholder={t('dealsTab.dealTitlePlaceholder')}
                          className="bg-background border-border text-foreground placeholder:text-muted-foreground h-8 text-sm"
                        />
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
                            <Input
                              type="number"
                              value={newDealValue}
                              onChange={(e) => setNewDealValue(e.target.value)}
                              placeholder={t('dealsTab.dealValuePlaceholder')}
                              className="bg-background border-border text-foreground placeholder:text-muted-foreground h-8 text-sm pl-6"
                            />
                          </div>
                          <Button
                            size="sm"
                            onClick={createDeal}
                            disabled={!newDealTitle.trim() || savingDeal}
                            className="bg-primary hover:bg-primary/90 text-primary-foreground"
                          >
                            {savingDeal ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => { setShowDealForm(false); setNewDealTitle(''); setNewDealValue(''); }}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <X className="size-3.5" />
                          </Button>
                        </div>
                      </div>
                    )}
                    {deals.length === 0 && !showDealForm && (
                      <p className="text-xs text-muted-foreground">{t('dealsTab.noDeals')}</p>
                    )}
                    {deals.map((deal) => (
                      <div
                        key={deal.id}
                        className="rounded-lg border border-border bg-muted/50 p-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium text-foreground">
                            {deal.title}
                          </p>
                          {deal.stage && (
                            <span
                              className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                              style={{
                                backgroundColor: `${deal.stage.color}20`,
                                color: deal.stage.color,
                              }}
                            >
                              {deal.stage.name}
                            </span>
                          )}
                        </div>
                        <div className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <DollarSign className="size-3" />
                            {formatCurrency(
                              deal.value ?? 0,
                              deal.currency || defaultCurrency,
                            )}
                          </span>
                          {deal.status && deal.status !== 'open' && (
                            <span
                              className={
                                deal.status === 'won'
                                  ? 'text-primary'
                                  : 'text-red-400'
                              }
                            >
                              {deal.status}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* Follow-ups Tab */}
              <TabsContent value="followups" className="flex-1 overflow-y-auto px-4 py-3">
                {loadingFollowUps ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="size-5 animate-spin text-primary" />
                  </div>
                ) : followUps.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-8">{t('followUpsTab.noFollowUps', { fallback: 'No follow-ups yet' })}</p>
                ) : (
                  <div className="space-y-2">
                    {followUps.map((fu) => (
                      <div
                        key={fu.id}
                        className={`rounded-lg border border-border bg-muted/50 p-3 ${fu.status === 'completed' ? 'opacity-60' : ''}`}
                      >
                        <div className="flex items-start gap-2">
                          <button
                            onClick={() => toggleFollowUp(fu)}
                            className="mt-0.5 shrink-0"
                          >
                            {fu.status === 'completed' ? (
                              <CheckCircle2 className="size-4 text-primary" />
                            ) : (
                              <Circle className="size-4 text-muted-foreground" />
                            )}
                          </button>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium ${fu.status === 'completed' ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                              {fu.title}
                            </p>
                            {fu.description && (
                              <p className="mt-0.5 text-xs text-muted-foreground">{fu.description}</p>
                            )}
                            {fu.due_date && (
                              <p className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                                <Calendar className="size-3" />
                                Due: {new Date(fu.due_date).toLocaleString()}
                              </p>
                            )}
                          </div>
                          <button
                            onClick={() => deleteFollowUp(fu.id)}
                            className="shrink-0 text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-3 space-y-2">
                  <div className="flex gap-2">
                    <Input
                      value={newFollowUpTitle}
                      onChange={(e) => setNewFollowUpTitle(e.target.value)}
                      placeholder={t('followUpsTab.addFollowUpPlaceholder', { fallback: 'Add a follow-up...' })}
                      onKeyDown={(e) => { if (e.key === 'Enter') addFollowUp(); }}
                      className="bg-muted border-border text-foreground placeholder:text-muted-foreground h-8 text-sm"
                    />
                    <Button
                      onClick={addFollowUp}
                      disabled={!newFollowUpTitle.trim() || addingFollowUp}
                      size="sm"
                      className="bg-primary hover:bg-primary/90 text-primary-foreground"
                    >
                      {addingFollowUp ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
                    </Button>
                  </div>
                  <input
                    type="datetime-local"
                    value={newFollowUpDate}
                    onChange={(e) => setNewFollowUpDate(e.target.value)}
                    className="w-full rounded-md border border-border bg-muted px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50"
                  />
                </div>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </SheetContent>
    </Sheet>
    <TemplatePicker
      open={templatePickerOpen}
      onOpenChange={setTemplatePickerOpen}
      onSelect={handleSendTemplate}
    />
    </>
  );
}

function SourceDetail({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span
        className={`break-all text-right text-foreground ${
          mono ? "font-mono text-xs" : "font-medium"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
