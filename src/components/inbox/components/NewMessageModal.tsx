import React, { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  AlertTriangle,
  Eye,
  Loader2,
  Paperclip,
  Search,
  Send,
  Wand2,
  X,
} from "lucide-react";
import type {
  ComposeChannel,
  DomainStatus,
  GmailStatus,
  LeadLike,
  SenderType,
} from "../types";
import { QuietHoursError } from "../types";
import { useQuietHoursConfirm } from "./useQuietHoursConfirm";
import { SMS_MAX_SEGMENTS } from "../constants";
import {
  contactDisplayName,
  contactMeta,
  initials,
} from "../utils/contactUtils";
import { sendInboxEmail, sendInboxSms } from "../api/sendMessage";
import { fetchConnectedAccounts } from "../../../api/connectedAccounts";
import {
  extractSmsErrorMessage,
  isSmsConsentError,
  isSmsPendingConfirmationError,
} from "../../../utils/smsConsent";
import {
  smsSegmentCount,
  smsSegmentError,
  SMS_SEGMENT_LENGTH,
} from "../../../utils/smsSegments";
import {
  insertTokenAtCursor,
  renderPersonalizedText,
  validatePersonalization,
} from "../../../utils/personalization";
import {
  uploadMessageAttachments,
  type UploadedAttachment,
} from "../../../utils/messageAttachments";
import { generateAiLeadMessageDraft } from "../../../utils/aiMessageDraft";
import AttachmentGallery from "../../AttachmentGallery";
import { LiveClock } from "../../LiveClock";
import AttachmentChips from "./AttachmentChips";
import PersonalizeOptionsMenu from "./PersonalizeOptionsMenu";
import EmptyStateCard from "./EmptyStateCard";

export default function NewMessageModal({
  apiBase,
  smsApiBase,
  token,
  userId,
  orgId,
  userName,
  orgName,
  leads,
  gmailStatus,
  domainStatus,
  domainEmail,
  telnyxApproved,
  onClose,
  onConnectGmail,
  onManageBusinessEmail,
  onSent,
}: {
  apiBase: string;
  smsApiBase: string;
  token: string;
  userId: string;
  orgId: string;
  userName: string;
  orgName: string;
  leads: LeadLike[];
  gmailStatus: GmailStatus;
  domainStatus: DomainStatus;
  domainEmail: string;
  telnyxApproved: boolean | null;
  onClose: () => void;
  onConnectGmail: () => void;
  onManageBusinessEmail: () => void;
  onSent: (leadId: number) => Promise<void> | void;
}) {
  const { modal: quietHoursModal, confirm: askQuietHours } =
    useQuietHoursConfirm();
  const [search, setSearch] = useState("");
  const [selectedLead, setSelectedLead] = useState<LeadLike | null>(null);
  const [channel, setChannel] = useState<ComposeChannel>("sms");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<UploadedAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [loadingAI, setLoadingAI] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const subjectRef = useRef<HTMLInputElement | null>(null);

  // Modal-local infinite-scroll pagination. Same pattern as the main Inbox
  // contacts panel (Sarwar a9f3a6c), but sourcing from /api/leads/orgId so
  // composers can pick from any lead in the org, not just inbox conversations.
  const MODAL_PAGE_SIZE = 15;
  const [pagedLeads, setPagedLeads] = useState<LeadLike[]>([]);
  const [pageNum, setPageNum] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingPage, setLoadingPage] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const h = window.setTimeout(() => setDebouncedSearch(search.trim()), 500);
    return () => window.clearTimeout(h);
  }, [search]);
  const searchPending = search.trim() !== debouncedSearch;

  const buildLeadsUrl = (page: number, size: number, q: string) => {
    const params = new URLSearchParams();
    params.set("include_meta", "1");
    params.set("page", String(page));
    params.set("page_size", String(size));
    if (q) params.set("q", q);
    return `${apiBase}/leads/${orgId}?${params.toString()}`;
  };

  const loadFirstPage = async () => {
    if (!token || !orgId) return;
    setLoadingPage(true);
    try {
      const res = await fetch(buildLeadsUrl(1, MODAL_PAGE_SIZE, debouncedSearch), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json().catch(() => ({}))) as {
        items?: LeadLike[];
        pagination?: { total?: number; has_next?: boolean };
      };
      const items = Array.isArray(data?.items) ? data.items : [];
      setPagedLeads(items);
      setPageNum(1);
      setHasMore(
        typeof data?.pagination?.has_next === "boolean"
          ? data.pagination.has_next
          : items.length >= MODAL_PAGE_SIZE,
      );
    } finally {
      setLoadingPage(false);
    }
  };

  const loadMore = async () => {
    if (!token || !orgId || loadingMore || !hasMore || loadingPage) return;
    setLoadingMore(true);
    try {
      const next = pageNum + 1;
      const res = await fetch(buildLeadsUrl(next, MODAL_PAGE_SIZE, debouncedSearch), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json().catch(() => ({}))) as {
        items?: LeadLike[];
        pagination?: { has_next?: boolean };
      };
      const incoming = Array.isArray(data?.items) ? data.items : [];
      setPagedLeads((current) => {
        const seen = new Set(current.map((c) => c.id));
        return [...current, ...incoming.filter((c) => !seen.has(c.id))];
      });
      setPageNum(next);
      setHasMore(
        typeof data?.pagination?.has_next === "boolean"
          ? data.pagination.has_next
          : incoming.length >= MODAL_PAGE_SIZE,
      );
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    void loadFirstPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, token, orgId]);

  // Backfill if the loaded list doesn't fill the scroll viewport.
  useEffect(() => {
    if (loadingPage || loadingMore || !hasMore) return;
    const el = listRef.current;
    if (el && el.scrollHeight <= el.clientHeight + 40) {
      void loadMore();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagedLeads, hasMore, loadingPage, loadingMore]);

  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const el = event.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 220) {
      void loadMore();
    }
  };

  // Display only the paginated window the modal has fetched - merging the
  // parent's full `leads` array would defeat pagination by dumping every
  // lead on first paint. We still accept the `leads` prop for compatibility.
  void leads;
  const filteredLeads = pagedLeads;

  // Inbox contact info to share with new leads - copy your number/email and
  // send it to them so anyone who texts or emails it shows up in the inbox.
  const channelsQ = useQuery({
    queryKey: ["connected-accounts"],
    queryFn: () => fetchConnectedAccounts(token),
    enabled: Boolean(token),
    staleTime: 5 * 60 * 1000,
  });
  const inboxPhone = channelsQ.data?.sms.phone_number || "";
  const inboxEmail = channelsQ.data?.email.address || "";
  const hasInboxChannels = Boolean(inboxPhone || inboxEmail);

  const hasVerifiedBusinessEmail = domainStatus === "verified";
  const emailAvailable =
    gmailStatus === "connected" || hasVerifiedBusinessEmail;
  const smsAvailable = telnyxApproved === true;
  const previewLead = selectedLead
    ? {
        ...selectedLead,
        stage: selectedLead.status,
      }
    : null;

  useEffect(() => {
    if (!selectedLead) return;
    if (selectedLead.phone) {
      setChannel("sms");
      return;
    }
    setChannel("email");
  }, [selectedLead]);


  const handleUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const uploaded = await uploadMessageAttachments(apiBase, token, files);
      setAttachments((current) => [...current, ...uploaded]);
    } catch (error) {
      toast.error((error as Error)?.message || "Failed to upload attachments");
    } finally {
      setUploading(false);
    }
  };

  const handleInsertToken = (field: "subject" | "body", tokenValue: string) => {
    if (!tokenValue) return;
    if (field === "subject") {
      const start = subjectRef.current?.selectionStart;
      const end = subjectRef.current?.selectionEnd;
      setSubject((current) =>
        insertTokenAtCursor(current, tokenValue, start, end),
      );
      return;
    }
    const start = bodyRef.current?.selectionStart;
    const end = bodyRef.current?.selectionEnd;
    setBody((current) => insertTokenAtCursor(current, tokenValue, start, end));
  };

  const handleGenerateAi = async () => {
    if (!selectedLead) {
      toast.error("Select a contact first.");
      return;
    }
    setLoadingAI(true);
    try {
      const result = await generateAiLeadMessageDraft({
        apiBase,
        token,
        channel,
        currentMessage: body,
        leadData: [selectedLead],
        prompt:
          channel === "sms"
            ? "Create a concise, personalized SMS outreach message for this lead."
            : "Create a personalized outreach email message for this lead.",
      });
      setBody(result.text);
    } catch (error) {
      toast.error((error as Error)?.message || "Failed to generate AI message.");
    } finally {
      setLoadingAI(false);
    }
  };

  const handleSend = async () => {
    if (!selectedLead) {
      toast.error("Select a contact first.");
      return;
    }

    const validationError = validatePersonalization(
      channel === "email" ? subject : undefined,
      body,
    );
    if (validationError) {
      toast.error(validationError);
      return;
    }

    if (!body.trim()) {
      toast.error("Write a message before sending.");
      return;
    }

    setSending(true);
    try {
      // Inner helper: returns true on success, false on a handled failure,
      // or rethrows QuietHoursError so the outer retry loop can prompt.
      const attempt = async (confirmQuietHours: boolean): Promise<boolean> => {
        if (channel === "email") {
          if (!selectedLead.email) {
            toast.error("This contact does not have an email address.");
            return false;
          }
          const resolvedSenderType: SenderType = hasVerifiedBusinessEmail
            ? "business"
            : "personal";

          if (resolvedSenderType === "personal" && gmailStatus !== "connected") {
            toast.error("Connect Gmail before sending email.");
            return false;
          }

          if (resolvedSenderType === "business" && domainStatus !== "verified") {
            toast.error("Connect a verified business email before sending.");
            return false;
          }

          const { res, data } = await sendInboxEmail({
            apiBase,
            token,
            userId,
            orgId,
            senderName: userName,
            to: selectedLead.email,
            subject: subject.trim(),
            body: body.trim(),
            leadId: selectedLead.id,
            senderType: resolvedSenderType,
            attachments,
            confirmQuietHours,
          });

          if (res.status === 403 && data?.code === "NEEDS_REAUTH") {
            toast.error("Reconnect Gmail before sending email.");
            return false;
          }

          if (!res.ok) {
            toast.error(data?.error || data?.message || "Failed to send email.");
            return false;
          }
          return true;
        }

        if (!selectedLead.phone) {
          toast.error("This contact does not have a phone number.");
          return false;
        }
        if (!smsAvailable) {
          toast.error("Complete SMS activation before sending SMS.");
          return false;
        }

        const { res, data } = await sendInboxSms({
          smsApiBase,
          token,
          to: selectedLead.phone,
          body: body.trim(),
          leadId: selectedLead.id,
          attachments,
          confirmQuietHours,
        });

        if (!res.ok) {
          const errorMessage = extractSmsErrorMessage(data);
          if (isSmsPendingConfirmationError(errorMessage)) {
            toast.error(
              "SMS opt-in is pending. The contact must reply YES first.",
            );
            return false;
          }
          if (isSmsConsentError(errorMessage)) {
            toast.error("SMS consent is required before sending.");
            return false;
          }
          toast.error(errorMessage || "Failed to send SMS.");
          return false;
        }
        return true;
      };

      let succeeded = false;
      try {
        succeeded = await attempt(false);
      } catch (err) {
        if (err instanceof QuietHoursError) {
          const proceed = await askQuietHours({
            timezone: err.timezone,
            hour: err.hour,
            until: err.until,
          });
          if (!proceed) return;
          succeeded = await attempt(true);
        } else {
          throw err;
        }
      }

      if (!succeeded) return;

      toast.success(`Message sent to ${contactDisplayName(selectedLead)}.`);
      await onSent(selectedLead.id);
      onClose();
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      {quietHoursModal}
      <div className="fixed inset-0 z-80 flex items-center justify-center bg-black/50 p-4">
      <div className="flex h-[88vh] w-full max-w-5xl overflow-hidden rounded-md bg-white shadow-2xl">
        <div className="flex min-h-0 w-full flex-col md:w-75 md:border-r md:border-gray-100">
          <div className="shrink-0 border-b border-gray-100 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-gray-900">
                  New Message
                </h2>
                <p className="text-xs text-gray-500">
                  Pick a contact to start composing.
                </p>
              </div>
            </div>
            <div className="relative mt-3">
              <Search
                size={14}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search contacts"
                className="w-full rounded-md border border-gray-200 py-2 pl-9 pr-8 text-sm outline-hidden transition focus:border-orange-300 focus:ring-2 focus:ring-orange-100"
              />
              {searchPending ? (
                <Loader2 size={12} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-gray-400" />
              ) : null}
            </div>
          </div>

          <div
            ref={listRef}
            onScroll={handleScroll}
            className="min-h-0 flex-1 overflow-y-auto"
          >
            {loadingPage && filteredLeads.length === 0 ? (
              <div className="m-3 flex items-center justify-center rounded-md border border-gray-100 bg-gray-50 p-6 text-sm text-gray-500">
                <Loader2 size={16} className="mr-2 animate-spin" />
                Loading contacts...
              </div>
            ) : filteredLeads.length === 0 ? (
              <div className="m-3 rounded-md border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">
                No contacts found.
              </div>
            ) : (
              <div className="flex flex-col">
                {filteredLeads.map((lead) => {
                  const active = selectedLead?.id === lead.id;
                  return (
                    <button
                      key={lead.id}
                      onClick={() => setSelectedLead(lead)}
                      className={`flex w-full items-center gap-3 border-b border-gray-100 px-4 py-2.5 text-left transition ${
                        active ? "bg-orange-50" : "hover:bg-gray-50"
                      }`}
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-gray-200 text-xs font-semibold text-gray-800">
                        {initials(contactDisplayName(lead))}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-gray-900">
                          {contactDisplayName(lead)}
                        </div>
                        <div className="truncate text-xs text-gray-500">
                          {contactMeta(lead)}
                        </div>
                      </div>
                    </button>
                  );
                })}
                {loadingMore ? (
                  <div className="flex items-center justify-center py-3 text-xs text-gray-400">
                    <Loader2 size={14} className="mr-2 animate-spin" />
                    Loading more...
                  </div>
                ) : hasMore ? (
                  <div className="py-2 text-center text-[11px] text-gray-300">
                    Scroll to load more
                  </div>
                ) : filteredLeads.length > MODAL_PAGE_SIZE ? (
                  <div className="py-2 text-center text-[11px] text-gray-300">
                    You're all caught up
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>

        <div className="hidden flex-1 flex-col md:flex">
          {!selectedLead ? (
            <>
              <div className="flex shrink-0 items-center justify-end border-b border-gray-100 px-6 py-3">
                <button
                  onClick={onClose}
                  className="text-gray-400 transition hover:text-gray-700"
                  aria-label="Close"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="flex flex-1 flex-col items-center justify-center gap-5 p-8">
                <EmptyStateCard
                  title="Choose a Contact"
                  description="Select someone from the left to compose an SMS or email without leaving the inbox."
                  secondaryLabel="Close"
                  onSecondary={onClose}
                />
                {hasInboxChannels && (
                  <div className="w-full max-w-md rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3">
                    <div className="text-sm font-semibold text-gray-900">
                      Share your inbox contact info
                    </div>
                    <p className="mt-0.5 text-xs text-gray-600">
                      Copy your number or email and send it to a lead. Anyone who texts
                      or emails them shows up in your inbox.
                    </p>
                    <div className="mt-2 flex flex-col gap-2">
                      {inboxPhone && (
                        <ChannelCopyRow label="Phone" value={inboxPhone} copyLabel="Phone number" />
                      )}
                      {inboxEmail && (
                        <ChannelCopyRow label="Email" value={inboxEmail} copyLabel="Email address" />
                      )}
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="border-b border-gray-100 px-6 py-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-lg font-semibold text-gray-900">
                      {contactDisplayName(selectedLead)}
                    </div>
                    <div className="text-sm text-gray-500">
                      {contactMeta(selectedLead)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setChannel("sms")}
                      disabled={!selectedLead.phone}
                      className={`rounded-2xl px-4 py-2 text-sm font-semibold ${
                        channel === "sms"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-gray-100 text-gray-600"
                      } disabled:cursor-not-allowed disabled:opacity-40`}
                    >
                      SMS
                    </button>
                    <button
                      onClick={() => setChannel("email")}
                      disabled={!selectedLead.email}
                      className={`rounded-2xl px-4 py-2 text-sm font-semibold ${
                        channel === "email"
                          ? "bg-blue-50 text-blue-700"
                          : "bg-gray-100 text-gray-600"
                      } disabled:cursor-not-allowed disabled:opacity-40`}
                    >
                      Email
                    </button>
                    <button
                      onClick={onClose}
                      className="ml-1 text-gray-400 transition hover:text-gray-700"
                      aria-label="Close"
                    >
                      <X size={18} />
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-5">
                {channel === "email" && !emailAvailable ? (
                  <div className="rounded-[28px] border border-amber-200 bg-amber-50 p-5">
                    <div className="flex items-start gap-3">
                      <AlertTriangle
                        className="mt-0.5 text-amber-600"
                        size={18}
                      />
                      <div>
                        <div className="font-semibold text-amber-900">
                          Email is not connected
                        </div>
                        <p className="mt-1 text-sm text-amber-800">
                          Connect Gmail or complete business email setup from
                          the Automations page before sending email from inbox.
                        </p>
                        <div className="mt-4 flex gap-2">
                          <button
                            onClick={onConnectGmail}
                            className="rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-gray-700"
                          >
                            Connect Gmail
                          </button>
                          <button
                            onClick={onManageBusinessEmail}
                            className="rounded-2xl border border-amber-200 px-4 py-2 text-sm font-semibold text-amber-900"
                          >
                            Manage Business Email
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : channel === "sms" && !smsAvailable ? (
                  <div className="rounded-[28px] border border-amber-200 bg-amber-50 p-5">
                    <div className="flex items-start gap-3">
                      <AlertTriangle
                        className="mt-0.5 text-amber-600"
                        size={18}
                      />
                      <div>
                        <div className="font-semibold text-amber-900">
                          SMS is not connected
                        </div>
                        <p className="mt-1 text-sm text-amber-800">
                          Complete SMS activation before sending text messages
                          from inbox.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {channel === "email" ? (
                      <>
                        <div className="flex items-center justify-between gap-3 rounded-3xl border border-gray-200 bg-gray-50 px-4 py-3">
                          <div>
                            <div className="text-sm font-semibold text-gray-900">
                              Send Email From
                            </div>
                            <div className="text-xs text-gray-500">
                              {hasVerifiedBusinessEmail
                                ? domainEmail || "Business Email"
                                : "Gmail"}
                            </div>
                          </div>
                          <span
                            className={`rounded-2xl px-3 py-2 text-xs font-semibold ${hasVerifiedBusinessEmail ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700"}`}
                          >
                            {hasVerifiedBusinessEmail
                              ? "Business Email"
                              : "Gmail"}
                          </span>
                        </div>

                        <div className="block text-sm text-gray-600">
                          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                            <span className="font-medium text-gray-900">
                              Subject
                            </span>
                            <PersonalizeOptionsMenu
                              direction="down"
                              onInsertBody={(tokenValue) =>
                                handleInsertToken("subject", tokenValue)
                              }
                            />
                          </div>
                          <input
                            ref={subjectRef}
                            value={subject}
                            onChange={(event) => setSubject(event.target.value)}
                            className="w-full rounded-2xl border border-gray-200 px-4 py-3 outline-hidden transition focus:border-orange-300 focus:ring-2 focus:ring-orange-100"
                            placeholder="Hello {firstname}"
                          />
                        </div>
                      </>
                    ) : null}

                    <div className="block text-sm text-gray-600">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <span className="flex items-center gap-2.5">
                          <span className="font-medium text-gray-900">
                            Message
                          </span>
                          <LiveClock timezone={selectedLead?.timezone} />
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={handleGenerateAi}
                            disabled={!selectedLead || loadingAI}
                            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-700 transition hover:border-gray-300 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {loadingAI ? (
                              <Loader2 size={16} className="animate-spin" />
                            ) : (
                              <Wand2 size={16} />
                            )}
                            {body.trim() ? "Improve with AI" : "Generate with AI"}
                          </button>
                          <PersonalizeOptionsMenu
                            direction="down"
                            onInsertBody={(tokenValue) =>
                              handleInsertToken("body", tokenValue)
                            }
                          />
                        </div>
                      </div>
                      <textarea
                        ref={bodyRef}
                        rows={3}
                        value={body}
                        onChange={(event) => setBody(event.target.value)}
                        className="w-full rounded-3xl border border-gray-200 px-4 py-3 outline-hidden transition focus:border-orange-300 focus:ring-2 focus:ring-orange-100"
                        placeholder={
                          channel === "sms"
                            ? "Hey {firstname}, just checking in..."
                            : "Hi {firstname},\n\nJust following up..."
                        }
                      />
                    </div>

                    {channel === "sms" ? (
                      <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-600">
                        {body.length}/{SMS_SEGMENT_LENGTH} characters *{" "}
                        {smsSegmentCount(body)} segment
                        {smsSegmentCount(body) === 1 ? "" : "s"}
                        {smsSegmentError(body, SMS_MAX_SEGMENTS) ? (
                          <div className="mt-1 text-amber-600">
                            {smsSegmentError(body, SMS_MAX_SEGMENTS)}
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-1">
                        <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:border-gray-300">
                          <Paperclip size={16} />
                          {uploading ? "Uploading..." : "Add files"}
                          <input
                            type="file"
                            multiple
                            className="hidden"
                            onChange={(event) => handleUpload(event.target.files)}
                          />
                        </label>
                        {token && (
                          <AttachmentGallery
                            apiBase={apiBase}
                            token={token}
                            onSelect={(attachment) =>
                              setAttachments((current) =>
                                current.some((item) => item.id === attachment.id)
                                  ? current
                                  : [...current, attachment],
                              )
                            }
                            onDelete={(key) =>
                              setAttachments((current) =>
                                current.filter(
                                  (item) => (item.storage_key || item.id) !== key,
                                ),
                              )
                            }
                          />
                        )}
                      </div>
                      <button
                        onClick={() => setShowPreview((current) => !current)}
                        className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:border-gray-300"
                      >
                        <Eye size={16} />
                        {showPreview ? "Hide Preview" : "Preview"}
                      </button>
                    </div>

                    <AttachmentChips
                      attachments={attachments}
                      removable
                      onRemove={(id) =>
                        setAttachments((current) =>
                          current.filter((attachment) => attachment.id !== id),
                        )
                      }
                    />

                    {showPreview ? (
                      <div className="rounded-[28px] border border-gray-200 bg-slate-50 p-5">
                        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                          Preview
                        </div>
                        <div className="mt-3 text-sm text-gray-700">
                          {channel === "email" ? (
                            <div className="mb-3 rounded-2xl bg-white px-4 py-3">
                              <div className="text-xs text-gray-500">
                                Subject
                              </div>
                              <div className="mt-1 font-semibold text-gray-900">
                                {renderPersonalizedText(subject, previewLead, {
                                  name: userName,
                                  orgName,
                                })}
                              </div>
                            </div>
                          ) : null}
                          <div className="whitespace-pre-wrap rounded-2xl bg-white px-4 py-3 leading-6">
                            {renderPersonalizedText(body, previewLead, {
                              name: userName,
                              orgName,
                            })}
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-gray-100 px-6 py-4">
                <button
                  disabled={
                    sending ||
                    !selectedLead ||
                    !body.trim() ||
                    (channel === "email" && !subject.trim())
                  }
                  onClick={handleSend}
                  className="inline-flex items-center gap-2 rounded-2xl bg-orange-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {sending ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Send size={16} />
                  )}
                  Send {channel === "email" ? "Email" : "SMS"}
                </button>
                <button
                  onClick={onClose}
                  className="rounded-2xl border border-gray-200 px-5 py-3 text-sm font-semibold text-gray-700 transition hover:border-gray-300 hover:bg-gray-50"
                >
                  Close
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      </div>
    </>
  );
}

function ChannelCopyRow({
  label,
  value,
  copyLabel,
}: {
  label: string;
  value: string;
  copyLabel: string;
}) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${copyLabel} copied`);
    } catch {
      toast.error("Copy failed - select and copy manually");
    }
  };
  return (
    <div className="flex items-center gap-2 rounded-lg border border-blue-100 bg-white px-3 py-2">
      <span className="w-12 shrink-0 text-xs font-medium text-gray-500">{label}</span>
      <span className="flex-1 truncate text-sm text-gray-800" title={value}>
        {value}
      </span>
      <button
        type="button"
        onClick={() => void copy()}
        className="shrink-0 rounded-md bg-blue-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-blue-700"
      >
        Copy
      </button>
    </div>
  );
}
