import { useEffect, useRef, useState } from "react";
import { ChevronDown, Loader2, Trash2, ImageIcon, File as FileIcon, RefreshCw, Check, X } from "lucide-react";
import toast from "react-hot-toast";
import {
  listMessageAttachments,
  deleteMessageAttachment,
  formatFileSize,
  UploadedAttachment,
} from "../utils/messageAttachments";

/**
 * Small arrow button placed next to an upload button. Opens a dropdown that
 * lists the user's uploaded files (R2 gallery), shows total size/count, lets
 * them delete files, and optionally re-attach an existing file via onSelect.
 */
export default function AttachmentGallery({
  apiBase,
  token,
  onSelect,
  onDelete,
  className = "",
  isBottom,
}: {
  apiBase: string;
  token: string;
  onSelect?: (attachment: UploadedAttachment) => void;
  /** Called with the storage key (or id) of a file removed from the gallery, so
   * parents can drop it from any selected/attached list. */
  onDelete?: (key: string) => void;
  className?: string;
  isBottom?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<UploadedAttachment[]>([]);
  const [totalBytes, setTotalBytes] = useState(0);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await listMessageAttachments(apiBase, token);
      setItems(data.attachments);
      setTotalBytes(data.total_bytes);
    } catch (error) {
      toast.error((error as Error)?.message || "Failed to load gallery");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) load();
    else setConfirmKey(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const handleDelete = async (attachment: UploadedAttachment) => {
    const key = attachment.storage_key || attachment.id;
    if (!key) return;
    setConfirmKey(null);
    setDeletingKey(key);
    try {
      await deleteMessageAttachment(apiBase, token, key);
      setItems((current) => current.filter((item) => (item.storage_key || item.id) !== key));
      setTotalBytes((current) => Math.max(0, current - (attachment.size || 0)));
      onDelete?.(key);
      toast.success("Attachment deleted");
    } catch (error) {
      toast.error((error as Error)?.message || "Failed to delete attachment");
    } finally {
      setDeletingKey(null);
    }
  };

  const isImage = (a: UploadedAttachment) => a.content_type?.startsWith("image/") ?? false;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="Open attachment gallery"
        title="Manage gallery"
        className="flex h-7 w-6 items-center justify-center rounded-md text-gray-600 transition hover:bg-gray-100 hover:text-gray-900"
      >
        <ChevronDown size={17} strokeWidth={2.75} className={open ? "rotate-180 transition" : "transition"} />
      </button>

      {open && (
        <div className={`absolute left-0 z-50 mt-1 w-72 rounded-xl border border-gray-200 bg-white shadow-lg ${isBottom ? 'bottom-0' : ''}`}>
          <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
            <span className="text-xs font-semibold text-gray-700">Your gallery</span>
            <button
              type="button"
              onClick={load}
              aria-label="Refresh"
              className="text-gray-400 transition hover:text-gray-700"
            >
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            </button>
          </div>

          <div className="max-h-72 overflow-y-auto p-2">
            {loading ? (
              <div className="flex items-center justify-center py-6 text-gray-400">
                <Loader2 size={18} className="animate-spin" />
              </div>
            ) : items.length === 0 ? (
              <div className="py-6 text-center text-xs text-gray-400">No uploads yet</div>
            ) : (
              <ul className="space-y-1">
                {items.map((attachment) => {
                  const key = attachment.storage_key || attachment.id;
                  return (
                    <li
                      key={key}
                      className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-50"
                    >
                      <button
                        type="button"
                        onClick={() => onSelect?.(attachment)}
                        disabled={!onSelect}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-default"
                        title={onSelect ? "Attach this file" : attachment.name}
                      >
                        {isImage(attachment) && attachment.url ? (
                          <img
                            src={attachment.url}
                            alt={attachment.name}
                            className="h-9 w-9 shrink-0 rounded-md border border-gray-200 object-cover"
                          />
                        ) : (
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-gray-50 text-gray-400">
                            {isImage(attachment) ? <ImageIcon size={16} /> : <FileIcon size={16} />}
                          </span>
                        )}
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-medium text-gray-700">
                            {attachment.name}
                          </span>
                          <span className="block text-[11px] text-gray-400">
                            {formatFileSize(attachment.size)}
                          </span>
                        </span>
                      </button>
                      {confirmKey === key ? (
                        <span className="flex shrink-0 items-center gap-1">
                          <span className="text-[11px] font-medium text-gray-500">Delete?</span>
                          <button
                            type="button"
                            onClick={() => handleDelete(attachment)}
                            aria-label="Confirm delete"
                            title="Confirm delete"
                            className="rounded-md p-1 text-red-500 transition hover:bg-red-50"
                          >
                            <Check size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmKey(null)}
                            aria-label="Cancel delete"
                            title="Cancel"
                            className="rounded-md p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
                          >
                            <X size={14} />
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmKey(key)}
                          disabled={deletingKey === key}
                          aria-label="Delete attachment"
                          className="shrink-0 rounded-md p-1 text-gray-300 transition hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
                        >
                          {deletingKey === key ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Trash2 size={14} />
                          )}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="border-t border-gray-100 px-3 py-2 text-[11px] text-gray-500">
            {items.length} {items.length === 1 ? "file" : "files"} · {formatFileSize(totalBytes)} total
          </div>
        </div>
      )}
    </div>
  );
}
