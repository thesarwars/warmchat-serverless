import { Download, File, X } from "lucide-react";
import {
  formatFileSize,
  type UploadedAttachment,
} from "../../../utils/messageAttachments";
import { isImageAttachment } from "../utils/contactUtils";

export default function AttachmentChips({
  attachments,
  removable = false,
  onRemove,
}: {
  attachments: UploadedAttachment[];
  removable?: boolean;
  onRemove?: (id: string) => void;
}) {
  if (!attachments.length) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {attachments.map((attachment) => {
        // Image attachments render an actual thumbnail preview inside the box.
        if (isImageAttachment(attachment) && attachment.url) {
          return (
            <div
              key={attachment.id}
              className="group relative overflow-hidden rounded-xl border border-gray-200 bg-white"
            >
              <a
                href={attachment.url}
                target="_blank"
                rel="noreferrer"
                title={attachment.name}
              >
                <img
                  src={attachment.url}
                  alt={attachment.name}
                  className="max-h-40 w-auto max-w-48 object-cover"
                />
              </a>
              {removable ? (
                <button
                  type="button"
                  onClick={() => onRemove?.(attachment.id)}
                  aria-label="Remove attachment"
                  className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-black/80"
                >
                  <X size={12} />
                </button>
              ) : null}
            </div>
          );
        }

        return (
          <div
            key={attachment.id}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700"
          >
            <File size={14} />
            <div className="min-w-0">
              <div className="truncate font-medium">{attachment.name}</div>
              {attachment.size ? (
                <div className="text-[11px] text-gray-500">
                  {formatFileSize(attachment.size)}
                </div>
              ) : null}
            </div>
            {removable ? (
              <button
                type="button"
                onClick={() => onRemove?.(attachment.id)}
                className="text-gray-400 transition hover:text-gray-700"
              >
                <X size={14} />
              </button>
            ) : (
              <a
                href={attachment.url}
                target="_blank"
                rel="noreferrer"
                className="text-gray-400 transition hover:text-gray-700"
              >
                <Download size={14} />
              </a>
            )}
          </div>
        );
      })}
    </div>
  );
}
